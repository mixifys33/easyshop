const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'participants.userType'
    },
    userType: {
      type: String,
      enum: ['User', 'Seller'],
      required: true
    },
    name: String,
    email: String,
    avatar: String,
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  type: {
    type: String,
    enum: ['private', 'public'],
    default: 'private'
  },
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  metadata: {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order'
    },
    subject: String
  }
}, {
  timestamps: true
});

// Indexes for better performance
conversationSchema.index({ 'participants.user': 1 });
conversationSchema.index({ lastActivity: -1 });
conversationSchema.index({ type: 1 });

// Virtual to get other participant
conversationSchema.virtual('otherParticipant').get(function() {
  if (this.participants.length === 2) {
    return this.participants.find(p => p.user.toString() !== this.currentUserId?.toString());
  }
  return null;
});

// Method to add participant
conversationSchema.methods.addParticipant = function(userId, userType, userData = {}) {
  const existingParticipant = this.participants.find(p => 
    p.user.toString() === userId.toString() && p.userType === userType
  );
  
  if (!existingParticipant) {
    this.participants.push({
      user: userId,
      userType: userType,
      name: userData.name,
      email: userData.email,
      avatar: userData.avatar
    });
  }
  
  return this;
};

// Method to check if user is participant
conversationSchema.methods.hasParticipant = function(userId, userType) {
  return this.participants.some(p => 
    p.user.toString() === userId.toString() && p.userType === userType
  );
};

// Static method to find conversation between two users
conversationSchema.statics.findBetweenUsers = function(user1Id, user1Type, user2Id, user2Type) {
  return this.findOne({
    type: 'private',
    $and: [
      { 'participants.user': user1Id, 'participants.userType': user1Type },
      { 'participants.user': user2Id, 'participants.userType': user2Type }
    ]
  });
};

module.exports = mongoose.model('Conversation', conversationSchema);