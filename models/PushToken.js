const mongoose = require('mongoose');

const pushTokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null, // null = guest/anonymous device
  },
  // 'user' = customer, 'seller' = seller, 'admin' = admin
  userType: {
    type: String,
    enum: ['user', 'seller', 'admin', 'guest'],
    default: 'user',
  },
  platform: {
    type: String,
    enum: ['android', 'ios', 'web'],
    default: 'android',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('PushToken', pushTokenSchema);
