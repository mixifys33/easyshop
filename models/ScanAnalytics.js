const mongoose = require('mongoose');

const scanAnalyticsSchema = new mongoose.Schema({
  scanId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  
  // User information
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true,
  },
  userEmail: {
    type: String,
    trim: true,
    lowercase: true,
    default: null,
  },
  userName: {
    type: String,
    trim: true,
    default: null,
  },
  isAuthenticated: {
    type: Boolean,
    required: true,
    default: false,
    index: true,
  },
  
  // Scan details
  projectName: {
    type: String,
    required: true,
    trim: true,
  },
  scanMode: {
    type: String,
    enum: ['quick', 'deep'],
    required: true,
    default: 'quick',
  },
  
  // Results
  score: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
  },
  grade: {
    type: String,
    required: true,
    trim: true,
  },
  filesScanned: {
    type: Number,
    required: true,
    min: 0,
  },
  linesScanned: {
    type: Number,
    required: true,
    min: 0,
  },
  
  // Findings breakdown
  criticalFindings: {
    type: Number,
    required: true,
    default: 0,
  },
  highFindings: {
    type: Number,
    required: true,
    default: 0,
  },
  mediumFindings: {
    type: Number,
    required: true,
    default: 0,
  },
  lowFindings: {
    type: Number,
    required: true,
    default: 0,
  },
  infoFindings: {
    type: Number,
    required: true,
    default: 0,
  },
  totalFindings: {
    type: Number,
    required: true,
    default: 0,
  },
  
  // Performance metrics
  scanDurationMs: {
    type: Number,
    required: true,
    min: 0,
  },
  tokensSaved: {
    type: String,
    default: 'N/A',
  },
  
  // Scanner configuration
  scannersUsed: [{
    type: String,
    trim: true,
  }],
  
  // Success status
  success: {
    type: Boolean,
    required: true,
    default: true,
  },
  errorMessage: {
    type: String,
    trim: true,
  },
  
  // IP address for tracking (optional)
  ipAddress: {
    type: String,
    trim: true,
  },
  
  // User agent for tracking (optional)
  userAgent: {
    type: String,
    trim: true,
  },
  
}, {
  timestamps: true, // Adds createdAt and updatedAt automatically
});

// Indexes for better query performance
scanAnalyticsSchema.index({ createdAt: -1 });
scanAnalyticsSchema.index({ score: -1 });
scanAnalyticsSchema.index({ isAuthenticated: 1, createdAt: -1 });
scanAnalyticsSchema.index({ userId: 1, createdAt: -1 });

// Virtual for calculating scan duration in seconds
scanAnalyticsSchema.virtual('scanDurationSeconds').get(function() {
  return Math.round(this.scanDurationMs / 1000);
});

// Method to get summary statistics
scanAnalyticsSchema.statics.getSummaryStats = async function(filters = {}) {
  const pipeline = [
    { $match: filters },
    {
      $group: {
        _id: null,
        totalScans: { $sum: 1 },
        authenticatedScans: {
          $sum: { $cond: ['$isAuthenticated', 1, 0] }
        },
        unauthenticatedScans: {
          $sum: { $cond: ['$isAuthenticated', 0, 1] }
        },
        averageScore: { $avg: '$score' },
        totalFindings: { $sum: '$totalFindings' },
        totalCriticalFindings: { $sum: '$criticalFindings' },
        totalHighFindings: { $sum: '$highFindings' },
        averageScanDuration: { $avg: '$scanDurationMs' },
        successfulScans: {
          $sum: { $cond: ['$success', 1, 0] }
        },
        failedScans: {
          $sum: { $cond: ['$success', 0, 1] }
        },
      }
    }
  ];
  
  const result = await this.aggregate(pipeline);
  return result[0] || {
    totalScans: 0,
    authenticatedScans: 0,
    unauthenticatedScans: 0,
    averageScore: 0,
    totalFindings: 0,
    totalCriticalFindings: 0,
    totalHighFindings: 0,
    averageScanDuration: 0,
    successfulScans: 0,
    failedScans: 0,
  };
};

// Method to get scans by time period
scanAnalyticsSchema.statics.getScansByPeriod = async function(period = 'day') {
  const now = new Date();
  let startDate;
  
  switch (period) {
    case 'day':
      startDate = new Date(now.setHours(0, 0, 0, 0));
      break;
    case 'week':
      startDate = new Date(now.setDate(now.getDate() - 7));
      break;
    case 'month':
      startDate = new Date(now.setMonth(now.getMonth() - 1));
      break;
    case 'year':
      startDate = new Date(now.setFullYear(now.getFullYear() - 1));
      break;
    default:
      startDate = new Date(now.setHours(0, 0, 0, 0));
  }
  
  return await this.countDocuments({ createdAt: { $gte: startDate } });
};

// Method to get top projects scanned
scanAnalyticsSchema.statics.getTopProjects = async function(limit = 10) {
  return await this.aggregate([
    {
      $group: {
        _id: '$projectName',
        scanCount: { $sum: 1 },
        averageScore: { $avg: '$score' },
        totalFindings: { $sum: '$totalFindings' },
      }
    },
    { $sort: { scanCount: -1 } },
    { $limit: limit },
    {
      $project: {
        projectName: '$_id',
        scanCount: 1,
        averageScore: { $round: ['$averageScore', 1] },
        totalFindings: 1,
        _id: 0,
      }
    }
  ]);
};

module.exports = mongoose.model('ScanAnalytics', scanAnalyticsSchema);
