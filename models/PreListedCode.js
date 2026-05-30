const mongoose = require('mongoose');

const preListedCodeSchema = new mongoose.Schema({
  // Developer Information (Seller)
  developerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller',
    required: true
  },
  developerEmail: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  developerName: {
    type: String,
    required: true
  },
  
  // Codebase Information (using Application model fields)
  detailedDescription: {
    type: String,
    default: ''
  },
  
  // VettCode Scan Results
  vettScore: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  vettGrade: {
    type: String,
    enum: ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F'],
    required: true
  },
  executiveVerdict: {
    type: String,
    required: true
  },
  scanReport: {
    type: mongoose.Schema.Types.Mixed, // Full VettReport JSON
    required: true
  },
  fileTree: {
    type: mongoose.Schema.Types.Mixed, // File tree structure JSON
    default: null
  },
  
  // Code Storage
  codeZipUrl: {
    type: String, // S3/ImageKit URL to stored ZIP
    default: ''
  },
  codeZipFileId: {
    type: String,
    default: ''
  },
  codeSize: {
    type: Number, // Size in bytes
    default: 0
  },
  
  // Technology Stack (auto-detected from scan)
  languages: [String], // ['JavaScript', 'TypeScript', 'Python']
  frameworks: [String], // ['React', 'Express', 'Next.js']
  hasTests: {
    type: Boolean,
    default: false
  },
  hasDocumentation: {
    type: Boolean,
    default: false
  },
  
  // Application Information (matching Application model)
  appName: {
    type: String,
    required: true,
    trim: true
  },
  shortDescription: {
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
  
  // Pre-List Status
  status: {
    type: String,
    enum: ['pending_review', 'approved', 'rejected', 'published'],
    default: 'pending_review'
  },
  preListedAt: {
    type: Date,
    default: Date.now
  },
  reviewedAt: {
    type: Date
  },
  publishedAt: {
    type: Date
  },
  
  // Notifications
  notificationSent: {
    type: Boolean,
    default: false
  },
  launchNotificationSent: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes for performance
preListedCodeSchema.index({ developerId: 1, status: 1 });
preListedCodeSchema.index({ vettScore: -1 });
preListedCodeSchema.index({ preListedAt: -1 });
preListedCodeSchema.index({ status: 1, vettScore: -1 });

module.exports = mongoose.model('PreListedCode', preListedCodeSchema);