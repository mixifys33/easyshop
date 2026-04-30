const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const Seller = require('../models/Seller');
const { authenticateToken } = require('../middleware/auth');

// Helper function to get user data
const getUserData = async (userId, userType) => {
  try {
    let user;
    if (userType === 'User') {
      user = await User.findById(userId).select('name email profileImage');
    } else if (userType === 'Seller') {
      user = await Seller.findById(userId).select('name email profileImage shopName');
    }
    
    if (!user) return null;
    
    return {
      id: user._id,
      name: user.name || user.shopName || 'Unknown',
      email: user.email,
      avatar: user.profileImage || null,
      userType: userType
    };
  } catch (error) {
    console.error('Error getting user data:', error);
    return null;
  }
};

// Helper function to populate conversation participants
const populateConversationParticipants = async (conversation) => {
  const populatedParticipants = [];
  
  for (const participant of conversation.participants) {
    const userData = await getUserData(participant.user, participant.userType);
    if (userData) {
      populatedParticipants.push({
        ...userData,
        joinedAt: participant.joinedAt
      });
    }
  }
  
  return {
    ...conversation.toObject(),
    participants: populatedParticipants
  };
};

// Get all users for chat selection (excluding current user)
router.get('/users', authenticateToken, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const currentUserType = req.user.userType || 'User';
    
    // Get all users except current user
    const users = await User.find({ 
      _id: { $ne: currentUserId } 
    }).select('name email profileImage createdAt').limit(50);
    
    // Get all sellers except current user (if current user is seller)
    const sellers = await Seller.find(
      currentUserType === 'Seller' 
        ? { _id: { $ne: currentUserId } }
        : {}
    ).select('name email profileImage shopName createdAt').limit(50);
    
    // Format response
    const allUsers = [
      ...users.map(user => ({
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.profileImage,
        userType: 'buyer',
        isOnline: Math.random() > 0.5, // Mock online status
        lastSeen: user.createdAt
      })),
      ...sellers.map(seller => ({
        id: seller._id,
        name: seller.name || seller.shopName,
        email: seller.email,
        avatar: seller.profileImage,
        userType: 'seller',
        isOnline: Math.random() > 0.5, // Mock online status
        lastSeen: seller.createdAt
      }))
    ];
    
    res.json({
      success: true,
      users: allUsers.sort((a, b) => a.name.localeCompare(b.name))
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message
    });
  }
});

// Get conversations for current user
router.get('/conversations', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.userType || 'User';
    
    // Find conversations where user is a participant
    const conversations = await Conversation.find({
      'participants.user': userId,
      'participants.userType': userType,
      isActive: true
    })
    .populate('lastMessage')
    .sort({ lastActivity: -1 })
    .limit(50);
    
    // Populate participant data and calculate unread counts
    const populatedConversations = [];
    
    for (const conversation of conversations) {
      const populated = await populateConversationParticipants(conversation);
      
      // Get unread count for this conversation
      const unreadCount = await Message.getUnreadCount(userId, userType, conversation._id);
      
      // Get other participants (exclude current user)
      const otherParticipants = populated.participants.filter(p => 
        !(p.id.toString() === userId.toString() && p.userType === userType)
      );
      
      populatedConversations.push({
        id: populated._id,
        participants: otherParticipants,
        lastMessage: populated.lastMessage ? {
          id: populated.lastMessage._id,
          text: populated.lastMessage.content.text,
          timestamp: populated.lastMessage.createdAt,
          senderId: populated.lastMessage.sender.user,
          senderName: populated.lastMessage.sender.name
        } : null,
        unreadCount,
        updatedAt: populated.lastActivity || populated.updatedAt
      });
    }
    
    res.json({
      success: true,
      conversations: populatedConversations
    });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch conversations',
      error: error.message
    });
  }
});

// Start or get existing conversation with a user
router.post('/conversations/start', authenticateToken, async (req, res) => {
  try {
    const { userId: targetUserId, userType: targetUserType = 'User' } = req.body;
    const currentUserId = req.user.id;
    const currentUserType = req.user.userType || 'User';
    
    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        message: 'Target user ID is required'
      });
    }
    
    // Check if conversation already exists
    let conversation = await Conversation.findBetweenUsers(
      currentUserId, currentUserType,
      targetUserId, targetUserType
    );
    
    if (conversation) {
      const populated = await populateConversationParticipants(conversation);
      return res.json({
        success: true,
        conversation: {
          id: populated._id,
          participants: populated.participants,
          createdAt: populated.createdAt,
          updatedAt: populated.updatedAt
        }
      });
    }
    
    // Get user data for both participants
    const currentUserData = await getUserData(currentUserId, currentUserType);
    const targetUserData = await getUserData(targetUserId, targetUserType);
    
    if (!currentUserData || !targetUserData) {
      return res.status(404).json({
        success: false,
        message: 'One or both users not found'
      });
    }
    
    // Create new conversation
    conversation = new Conversation({
      type: 'private',
      participants: [
        {
          user: currentUserId,
          userType: currentUserType,
          name: currentUserData.name,
          email: currentUserData.email,
          avatar: currentUserData.avatar
        },
        {
          user: targetUserId,
          userType: targetUserType,
          name: targetUserData.name,
          email: targetUserData.email,
          avatar: targetUserData.avatar
        }
      ]
    });
    
    await conversation.save();
    
    const populated = await populateConversationParticipants(conversation);
    
    res.json({
      success: true,
      conversation: {
        id: populated._id,
        participants: populated.participants,
        createdAt: populated.createdAt,
        updatedAt: populated.updatedAt
      }
    });
  } catch (error) {
    console.error('Error starting conversation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start conversation',
      error: error.message
    });
  }
});

// Get messages for a conversation
router.get('/conversations/:conversationId/messages', authenticateToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const userId = req.user.id;
    const userType = req.user.userType || 'User';
    
    // Verify user is participant in conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.hasParticipant(userId, userType)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this conversation'
      });
    }
    
    // Get messages with pagination
    const skip = (page - 1) * limit;
    const messages = await Message.find({
      conversation: conversationId,
      isDeleted: false
    })
    .populate('replyTo', 'content.text sender.name')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));
    
    // Check if there are more messages
    const totalMessages = await Message.countDocuments({
      conversation: conversationId,
      isDeleted: false
    });
    const hasMore = skip + messages.length < totalMessages;
    
    // Format messages
    const formattedMessages = messages.map(message => ({
      id: message._id,
      text: message.content.text,
      type: message.content.type,
      senderId: message.sender.user,
      senderName: message.sender.name,
      senderAvatar: message.sender.avatar,
      timestamp: message.createdAt,
      status: message.status,
      replyTo: message.replyTo ? {
        id: message.replyTo._id,
        text: message.replyTo.content.text,
        senderName: message.replyTo.sender.name
      } : null,
      isEdited: message.isEdited,
      editedAt: message.editedAt
    }));
    
    res.json({
      success: true,
      messages: formattedMessages,
      hasMore,
      totalMessages
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages',
      error: error.message
    });
  }
});

// Send a message
router.post('/conversations/:conversationId/messages', authenticateToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { text, type = 'text', replyTo } = req.body;
    const userId = req.user.id;
    const userType = req.user.userType || 'User';
    
    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Message text is required'
      });
    }
    
    // Verify user is participant in conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.hasParticipant(userId, userType)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this conversation'
      });
    }
    
    // Get sender data
    const senderData = await getUserData(userId, userType);
    if (!senderData) {
      return res.status(404).json({
        success: false,
        message: 'Sender not found'
      });
    }
    
    // Create message
    const message = new Message({
      conversation: conversationId,
      sender: {
        user: userId,
        userType: userType,
        name: senderData.name,
        email: senderData.email,
        avatar: senderData.avatar
      },
      content: {
        text: text.trim(),
        type: type
      },
      replyTo: replyTo || null,
      status: 'sent'
    });
    
    await message.save();
    
    // Update conversation last activity
    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: message._id,
      lastActivity: new Date()
    });
    
    // Format response
    const formattedMessage = {
      id: message._id,
      text: message.content.text,
      type: message.content.type,
      senderId: message.sender.user,
      senderName: message.sender.name,
      senderAvatar: message.sender.avatar,
      timestamp: message.createdAt,
      status: message.status,
      conversationId: conversationId
    };
    
    // Emit to Socket.IO for real-time updates
    const io = req.app.get('io');
    if (io) {
      io.to(`conversation_${conversationId}`).emit('message_received', formattedMessage);
    }
    
    res.json({
      success: true,
      message: formattedMessage
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error.message
    });
  }
});

// Get public chat messages
router.get('/public', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;
    
    // Get public messages
    const messages = await Message.find({
      'conversation': null // Public messages have no conversation
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));
    
    // Check if there are more messages
    const totalMessages = await Message.countDocuments({
      'conversation': null
    });
    const hasMore = skip + messages.length < totalMessages;
    
    // Format messages
    const formattedMessages = messages.map(message => ({
      id: message._id,
      text: message.content.text,
      type: message.content.type,
      senderId: message.sender.user,
      senderName: message.sender.name,
      senderAvatar: message.sender.avatar,
      timestamp: message.createdAt,
      isSystem: message.content.type === 'system'
    }));
    
    res.json({
      success: true,
      messages: formattedMessages,
      hasMore,
      totalMessages
    });
  } catch (error) {
    console.error('Error fetching public messages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch public messages',
      error: error.message
    });
  }
});

// Send public message
router.post('/public', authenticateToken, async (req, res) => {
  try {
    const { text, type = 'text' } = req.body;
    const userId = req.user.id;
    const userType = req.user.userType || 'User';
    
    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Message text is required'
      });
    }
    
    // Get sender data
    const senderData = await getUserData(userId, userType);
    if (!senderData) {
      return res.status(404).json({
        success: false,
        message: 'Sender not found'
      });
    }
    
    // Create public message (no conversation)
    const message = new Message({
      conversation: null, // Public messages have no conversation
      sender: {
        user: userId,
        userType: userType,
        name: senderData.name,
        email: senderData.email,
        avatar: senderData.avatar
      },
      content: {
        text: text.trim(),
        type: type
      },
      status: 'sent'
    });
    
    await message.save();
    
    // Format response
    const formattedMessage = {
      id: message._id,
      text: message.content.text,
      type: message.content.type,
      senderId: message.sender.user,
      senderName: message.sender.name,
      senderAvatar: message.sender.avatar,
      timestamp: message.createdAt,
      isSystem: false
    };
    
    // Emit to Socket.IO for real-time updates
    const io = req.app.get('io');
    if (io) {
      io.to('public_chat').emit('public_message_received', formattedMessage);
    }
    
    res.json({
      success: true,
      message: formattedMessage
    });
  } catch (error) {
    console.error('Error sending public message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send public message',
      error: error.message
    });
  }
});

// Mark messages as read
router.post('/conversations/:conversationId/read', authenticateToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    const userType = req.user.userType || 'User';
    
    // Verify user is participant in conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.hasParticipant(userId, userType)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this conversation'
      });
    }
    
    // Mark all unread messages as read
    await Message.updateMany(
      {
        conversation: conversationId,
        'sender.user': { $ne: userId },
        'sender.userType': { $ne: userType },
        'readBy': {
          $not: {
            $elemMatch: {
              user: userId,
              userType: userType
            }
          }
        }
      },
      {
        $push: {
          readBy: {
            user: userId,
            userType: userType,
            readAt: new Date()
          }
        },
        $set: {
          status: 'read'
        }
      }
    );
    
    res.json({
      success: true,
      message: 'Messages marked as read'
    });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark messages as read',
      error: error.message
    });
  }
});

// Get new messages (for polling)
router.get('/messages/new', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.userType || 'User';
    const { since } = req.query;
    
    let query = {
      'sender.user': { $ne: userId },
      'sender.userType': { $ne: userType },
      isDeleted: false
    };
    
    // If since timestamp provided, get messages after that time
    if (since) {
      query.createdAt = { $gt: new Date(since) };
    } else {
      // Get messages from last 5 minutes if no timestamp
      query.createdAt = { $gt: new Date(Date.now() - 5 * 60 * 1000) };
    }
    
    // Find conversations where user is participant
    const userConversations = await Conversation.find({
      'participants.user': userId,
      'participants.userType': userType
    }).select('_id');
    
    const conversationIds = userConversations.map(c => c._id);
    
    // Get new messages from user's conversations or public messages
    const messages = await Message.find({
      $or: [
        { conversation: { $in: conversationIds } },
        { conversation: null } // Public messages
      ],
      ...query
    })
    .sort({ createdAt: -1 })
    .limit(20);
    
    // Format messages
    const formattedMessages = messages.map(message => ({
      id: message._id,
      text: message.content.text,
      type: message.content.type,
      senderId: message.sender.user,
      senderName: message.sender.name,
      senderAvatar: message.sender.avatar,
      timestamp: message.createdAt,
      conversationId: message.conversation,
      isPublic: !message.conversation
    }));
    
    res.json({
      success: true,
      messages: formattedMessages
    });
  } catch (error) {
    console.error('Error fetching new messages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch new messages',
      error: error.message
    });
  }
});

module.exports = router;