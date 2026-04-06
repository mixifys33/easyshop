const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  type: {
    type: String,
    enum: ['discount', 'flash_sale', 'buy_x_get_y', 'free_shipping', 'bundle'],
    required: true,
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'paused', 'ended'],
    default: 'draft',
  },
  discountType: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
  discountValue: { type: Number, default: 0 },
  minOrderAmount: { type: Number, default: 0 },
  maxUsage: { type: Number, default: null }, // null = unlimited
  usageCount: { type: Number, default: 0 },
  couponCode: { type: String, trim: true, uppercase: true },
  appliesTo: {
    type: String,
    enum: ['all_products', 'specific_products', 'specific_categories'],
    default: 'all_products',
  },
  productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  categories: [{ type: String }],
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  bannerColor: { type: String, default: '#e74c3c' },
  impressions: { type: Number, default: 0 },
  clicks: { type: Number, default: 0 },
}, { timestamps: true });

// Auto-update status based on dates — only when not paused
campaignSchema.pre('save', function (next) {
  if (this.status === 'paused') return next();
  const now = new Date();
  if (now < this.startDate) this.status = 'draft';
  else if (now > this.endDate) this.status = 'ended';
  else this.status = 'active';
  next();
});

module.exports = mongoose.model('Campaign', campaignSchema);
