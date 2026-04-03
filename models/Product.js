const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  // Basic Information
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  detailedDescription: {
    type: String,
    default: ''
  },
  tags: {
    type: String,
    default: ''
  },
  warranty: {
    type: String,
    default: ''
  },
  slug: {
    type: String,
    unique: true,
    sparse: true
  },
  brand: {
    type: String,
    default: ''
  },

  // Category Information
  category: {
    type: String,
    required: true
  },
  subCategory: {
    type: String,
    required: true
  },

  // Pricing
  regularPrice: {
    type: Number,
    required: true,
    min: 0
  },
  salePrice: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'UGX'
  },

  // Inventory
  stock: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },

  // Media
  images: [{
    url: {
      type: String,
      default: ''
    },
    fileId: {
      type: String,
      default: ''
    },
    thumbnailUrl: {
      type: String,
      default: ''
    },
    fileName: {
      type: String,
      default: ''
    },
    uploaded: {
      type: Boolean,
      default: false
    },
    // Legacy fields for backward compatibility
    uri: {
      type: String,
      default: ''
    },
    width: {
      type: Number,
      default: 0
    },
    height: {
      type: Number,
      default: 0
    },
    fileSize: {
      type: Number,
      default: 0
    },
    mimeType: {
      type: String,
      default: ''
    },
    compressionRatio: {
      type: Number,
      default: 0
    },
    originalSize: {
      type: Number,
      default: 0
    }
  }],
  videoUrl: {
    type: String,
    default: ''
  },

  // Product Variants
  colors: [String],
  sizes: [String],
  customSpecs: [{
    name: String,
    value: String
  }],

  // Additional Options
  cashOnDelivery: {
    type: String,
    enum: ['Yes', 'No'],
    default: 'Yes'
  },

  // Payment methods inherited from seller (auto-synced)
  paymentMethods: {
    mtnNumber: { type: String, default: '' },
    mtnName: { type: String, default: '' },
    airtelNumber: { type: String, default: '' },
    airtelName: { type: String, default: '' },
    bankName: { type: String, default: '' },
    bankAccountName: { type: String, default: '' },
    bankAccountNumber: { type: String, default: '' },
    bankBranch: { type: String, default: '' },
    preferredMethod: { type: String, default: '' },
  },

  // Delivery
  deliveryTerminals: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DeliveryTerminal'
  }],
  deliveryFee: { type: Number, default: 0 },
  freeDelivery: { type: Boolean, default: false },
  deliveryNotes: { type: String, default: '' },

  // Seller Information
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller',
    required: true
  },

  // Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'draft'],
    default: 'active'
  },
  featured: {
    type: Boolean,
    default: false
  },

  // Draft Information
  isDraft: {
    type: Boolean,
    default: false
  },
  draftExpiresAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Generate slug before saving
productSchema.pre('save', function(next) {
  if (!this.slug && this.title) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') + '-' + Date.now();
  }
  next();
});

// Index for better performance
productSchema.index({ sellerId: 1, status: 1 });
productSchema.index({ category: 1, subCategory: 1 });
productSchema.index({ title: 'text', description: 'text', tags: 'text' });

module.exports = mongoose.model('Product', productSchema);