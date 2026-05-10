const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema({
  // Basic Information
  appName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  shortDescription: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  detailedDescription: {
    type: String,
    required: true,
    trim: true
  },
  tags: {
    type: String,
    trim: true
  },
  appCategory: {
    type: String,
    required: true,
    enum: [
      'Web Application',
      'Mobile App (React Native)',
      'Mobile App (Native iOS)',
      'Mobile App (Native Android)',
      'Desktop Application',
      'API/Backend Service',
      'Chrome Extension',
      'WordPress Plugin',
      'NPM Package/Library',
      'CLI Tool',
      'Game',
      'E-commerce Solution',
      'CMS/Blog Platform',
      'Dashboard/Admin Panel',
      'Other'
    ]
  },
  technologyStack: [{
    type: String,
    trim: true
  }],

  // URLs & Links
  liveDemo: {
    type: String,
    trim: true
  },
  githubRepo: {
    type: String,
    trim: true
  },
  documentationUrl: {
    type: String,
    trim: true
  },
  videoDemo: {
    type: String,
    trim: true
  },

  // Visual Assets
  screenshots: [{
    url: String,
    fileId: String,
    thumbnailUrl: String,
    fileName: String,
    uploaded: Boolean
  }],
  appIcon: {
    url: String,
    fileId: String,
    thumbnailUrl: String,
    fileName: String,
    uploaded: Boolean
  },

  // Files
  sourceCodeFile: {
    url: String,
    fileId: String,
    fileName: String,
    fileSize: Number,
    uploaded: Boolean
  },

  // Seller Information
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller',
    required: true
  },

  // Pricing
  price: {
    type: Number,
    default: 0,
    min: 0
  },
  currency: {
    type: String,
    default: 'USD',
    enum: ['USD', 'EUR', 'GBP', 'UGX', 'KES', 'TZS', 'RWF']
  },
  isFree: {
    type: Boolean,
    default: false
  },
  licenseType: {
    type: String,
    default: 'MIT License'
  },

  // Platform & Dependencies
  supportedPlatforms: [{
    type: String,
    trim: true
  }],
  dependencies: [{
    type: String,
    trim: true
  }],

  // Commercial Terms
  commercialUse: {
    type: String,
    default: 'Yes',
    enum: ['Yes', 'No', 'With License']
  },
  resaleRights: {
    type: String,
    default: 'No',
    enum: ['Yes', 'No', 'With License']
  },
  supportLevel: {
    type: String,
    default: 'Community',
    enum: ['Community', 'Email', 'Priority', 'Enterprise']
  },
  updateFrequency: {
    type: String,
    default: 'Active',
    enum: ['Active', 'Maintenance', 'Deprecated']
  },
  warranty: {
    type: String,
    default: '30 days'
  },
  installationSupport: {
    type: String,
    default: 'Yes',
    enum: ['Yes', 'No', 'Paid']
  },

  // Status & Verification
  isDraft: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  verificationStatus: {
    type: String,
    default: 'pending',
    enum: ['pending', 'verified', 'rejected']
  },
  verificationNotes: {
    type: String,
    trim: true
  },

  // Draft Management
  draftExpiresAt: {
    type: Date
  },

  // Statistics
  views: {
    type: Number,
    default: 0
  },
  downloads: {
    type: Number,
    default: 0
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  reviewCount: {
    type: Number,
    default: 0
  },

  // Bulk Upload
  bulkUploaded: {
    type: Boolean,
    default: false
  },

  // Technical Details
  slug: {
    type: String,
    unique: true,
    sparse: true
  },
  metaDescription: {
    type: String,
    maxlength: 160
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  publishedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes for better performance
applicationSchema.index({ sellerId: 1 });
applicationSchema.index({ appCategory: 1 });
applicationSchema.index({ verificationStatus: 1 });
applicationSchema.index({ isActive: 1 });
applicationSchema.index({ isDraft: 1 });
applicationSchema.index({ createdAt: -1 });
applicationSchema.index({ rating: -1 });
applicationSchema.index({ views: -1 });
applicationSchema.index({ downloads: -1 });

// Text search index
applicationSchema.index({
  appName: 'text',
  shortDescription: 'text',
  detailedDescription: 'text',
  tags: 'text'
});

// Generate slug before saving
applicationSchema.pre('save', function(next) {
  if (this.isModified('appName') && !this.isDraft) {
    this.slug = this.appName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    
    // Add timestamp to ensure uniqueness
    this.slug += '-' + Date.now();
  }
  
  // Update updatedAt
  this.updatedAt = new Date();
  
  // Set publishedAt when first published
  if (this.isModified('isDraft') && !this.isDraft && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  
  next();
});

// Virtual for formatted price
applicationSchema.virtual('formattedPrice').get(function() {
  const currencySymbols = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    UGX: 'UGX ',
    KES: 'KSh ',
    TZS: 'TSh ',
    RWF: 'RWF '
  };
  
  const symbol = currencySymbols[this.currency] || this.currency + ' ';
  return symbol + this.price.toLocaleString();
});

// Virtual for average rating display
applicationSchema.virtual('displayRating').get(function() {
  return this.rating.toFixed(1);
});

// Static method to find applications by seller
applicationSchema.statics.findBySeller = function(sellerId) {
  return this.find({ sellerId, isDraft: false, isActive: true });
};

// Static method to find drafts by seller
applicationSchema.statics.findDraftsBySeller = function(sellerId) {
  return this.find({ sellerId, isDraft: true });
};

// Static method to search applications
applicationSchema.statics.searchApplications = function(query, filters = {}) {
  const searchQuery = {
    isDraft: false,
    isActive: true,
    verificationStatus: 'verified',
    ...filters
  };
  
  if (query) {
    searchQuery.$text = { $search: query };
  }
  
  return this.find(searchQuery).sort({ score: { $meta: 'textScore' }, createdAt: -1 });
};

// Instance method to increment views
applicationSchema.methods.incrementViews = function() {
  this.views += 1;
  return this.save();
};

// Instance method to increment downloads
applicationSchema.methods.incrementDownloads = function() {
  this.downloads += 1;
  return this.save();
};

module.exports = mongoose.model('Application', applicationSchema);