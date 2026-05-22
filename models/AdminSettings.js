const mongoose = require('mongoose');

const adminSettingsSchema = new mongoose.Schema(
  {
    singleton: { type: String, default: 'main', unique: true },
    displayName: { type: String, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AdminSettings', adminSettingsSchema);
