const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true
  },
  sender: {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'sender.userType',
      required: true
    },
    userType: {
      type: String,
      enum: ['User', 'Seller'],
      required: true
    },
    name: String,
    email: String,
    avatar: String
  },
  content: {
    text: {
      type: String,
      required: true,
      maxlength: 2000
    },
    type: {
      type: String,
      enum: ['text', 'image', 'file', 'system'],
      default: 'text'
    },
    attachments: [{
      type: {
        type: String,
        enum: ['image', 'file', 'audio', 'video']
      },
      url: String,
      filename: String,
      size: Number,
      mimeType: String
    }]
  },
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  status: {
    type: String,
    enum: ['sending', 'sent', 'delivered', 'read'],
    default: 'sent'
  },
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'readBy.userType'
    },
    userType: {
      type: String,
      enum: ['User', 'Seller']
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: Date,
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date,
  metadata: {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order'
    },
    systemType: {
      type: String,
      enum: ['welcome', 'order_update', 'product_inquiry', 'general']
    }
  }
}, {
  timestamps: true
});

// Indexes for better performance
messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ 'sender.user': 1 });
messageSchema.index({ status: 1 });
messageSchema.index({ createdAt: -1 });

// Virtual for formatted timestamp
messageSchema.virtual('formattedTime').get(function() {
  return this.createdAt.toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
});

// Method to mark as read by user
messageSchema.methods.markAsRead = function(userId, userType) {
  const existingRead = this.readBy.find(r => 
    r.user.toString() === userId.toString() && r.userType === userType
  );
  
  if (!existingRead) {
    this.readBy.push({
      user: userId,
      userType: userType,
      readAt: new Date()
    });
    
    // Update status if all participants have read
    // This would need conversation data to determine
    this.status = 'read';
  }
  
  return this;
};

// Method to check if read by user
messageSchema.methods.isReadBy = function(userId, userType) {
  return this.readBy.some(r => 
    r.user.toString() === userId.toString() && r.userType === userType
  );
};

// Static method to get unread count for user
messageSchema.statics.getUnreadCount = function(userId, userType, conversationId = null) {
  const query = {
    'sender.user': { $ne: userId },
    'sender.userType': { $ne: userType },
    'readBy': {
      $not: {
        $elemMatch: {
          user: userId,
          userType: userType
        }
      }
    },
    isDeleted: false
  };
  
  if (conversationId) {
    query.conversation = conversationId;
  }
  
  return this.countDocuments(query);
};

// Pre-save middleware to update conversation's lastActivity
messageSchema.pre('save', async function(next) {
  if (this.isNew) {
    try {
      await mongoose.model('Conversation').findByIdAndUpdate(
        this.conversation,
        { 
          lastMessage: this._id,
          lastActivity: this.createdAt || new Date()
        }
      );
    } catch (error) {
      console.error('Error updating conversation lastActivity:', error);
    }
  }
  next();
});

module.exports = mongoose.model('Message', messageSchema);