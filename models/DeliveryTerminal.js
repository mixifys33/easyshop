const mongoose = require('mongoose');

const deliveryTerminalSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  type: {
    type: String,
    enum: ['bus_terminal', 'courier', 'pickup_point', 'post_office'],
    default: 'bus_terminal'
  },
  company: { type: String, trim: true, default: 'Link Bus' },
  region: { type: String, trim: true },  // e.g. "Central", "Eastern"
  district: { type: String, trim: true },
  city: { type: String, trim: true },
  address: { type: String, trim: true },
  phone: { type: String, trim: true },
  active: { type: Boolean, default: true }
}, { timestamps: true });

deliveryTerminalSchema.index({ district: 1, active: 1 });
deliveryTerminalSchema.index({ company: 1 });

module.exports = mongoose.model('DeliveryTerminal', deliveryTerminalSchema);
