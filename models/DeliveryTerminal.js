const mongoose = require('mongoose');

const deliveryTerminalSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  company: {
    type: String,
    trim: true
  },
  region: {
    type: String,
    trim: true
  },
  district: {
    type: String,
    trim: true
  },
  city: {
    type: String,
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  type: {
    type: String,
    enum: ['pickup_point', 'delivery_hub', 'warehouse', 'store'],
    default: 'pickup_point'
  },
  active: {
    type: Boolean,
    default: true
  },
  coordinates: {
    latitude: Number,
    longitude: Number
  },
  operatingHours: {
    type: String,
    trim: true
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Indexes for better query performance
deliveryTerminalSchema.index({ active: 1 });
deliveryTerminalSchema.index({ region: 1, city: 1 });
deliveryTerminalSchema.index({ type: 1 });

module.exports = mongoose.model('DeliveryTerminal', deliveryTerminalSchema);
