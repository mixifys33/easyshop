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
  
  // Codebase Information
  projectName: {
    type: String,
    required: true,
    trim: true
  },
  projectDescription: {
    type: String,
    default: ''
  },
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
  
  // Product Information (for final listing)
  category: {
    type: String,
    required: true
  },
  subCategory: {
    type: String,
    required: true
  },
  tags: {
    type: String,
    default: ''
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
    default: 'USD'
  },
  
  // License & Usage
  licenseType: {
    type: String,
    enum: ['MIT', 'Apache 2.0', 'GPL', 'Commercial', 'Proprietary', 'Other'],
    default: 'Commercial'
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
    }
  }],
  demoUrl: {
    type: String,
    default: ''
  },
  documentationUrl: {
    type: String,
    default: ''
  },
  videoUrl: {
    type: String,
    default: ''
  },
  
  // Features
  features: [String], // Key features list
  
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
