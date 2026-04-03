const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const sellerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  phoneNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  verified: {
    type: Boolean,
    default: false
  },
  verificationToken: {
    type: String
  },
  resetPasswordToken: {
    type: String
  },
  resetPasswordExpires: {
    type: Date
  },
  // Shop information
  shop: {
    shopName: {
      type: String,
      trim: true
    },
    shopDescription: {
      type: String,
      trim: true
    },
    businessType: {
      type: String,
      enum: [
        'electronics', 'fashion', 'home-garden', 'sports', 'books', 
        'automotive', 'health-beauty', 'toys-games', 'food-beverages',
        'jewelry', 'art-crafts', 'services', 'other'
      ],
      trim: true
    },
    businessAddress: {
      type: String,
      trim: true
    },
    city: {
      type: String,
      trim: true
    },
    website: {
      type: String,
      trim: true
    },
    businessLicense: {
      type: String,
      trim: true
    },
    taxId: {
      type: String,
      trim: true
    },
    logo: {
      url: String,
      fileId: String,
      thumbnailUrl: String,
      fileName: String,
      uploaded: Boolean
    },
    banner: {
      url: String,
      fileId: String,
      thumbnailUrl: String,
      fileName: String,
      uploaded: Boolean
    },
    isSetup: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  // Profile image
  profileImage: {
    url: String,
    fileId: String,
    thumbnailUrl: String,
    fileName: String,
    uploaded: Boolean,
    updatedAt: Date
  },
  // Payment settings
  payment: {
    // MTN Mobile Money
    mtnMomo: {
      enabled: { type: Boolean, default: false },
      phoneNumber: { type: String, trim: true },
      accountName: { type: String, trim: true },
    },
    // Airtel Money
    airtelMoney: {
      enabled: { type: Boolean, default: false },
      phoneNumber: { type: String, trim: true },
      accountName: { type: String, trim: true },
    },
    // Bank Transfer
    bankTransfer: {
      enabled: { type: Boolean, default: false },
      bankName: { type: String, trim: true },
      accountNumber: { type: String, trim: true },
      accountName: { type: String, trim: true },
      branch: { type: String, trim: true },
    },
    // Cash on Delivery
    cashOnDelivery: { type: Boolean, default: true },
  },

  // Account status
  status: {
    type: String,
    enum: ['pending', 'active', 'suspended', 'banned'],
    default: 'pending'
  },
  // Payment settings
  payment: {
    // MTN Mobile Money
    mtnName: { type: String, trim: true },
    mtnNumber: { type: String, trim: true },
    // Airtel Money
    airtelName: { type: String, trim: true },
    airtelNumber: { type: String, trim: true },
    // Bank
    bankName: { type: String, trim: true },
    bankAccountName: { type: String, trim: true },
    bankAccountNumber: { type: String, trim: true },
    bankBranch: { type: String, trim: true },
    // Preferred
    preferredMethod: { type: String, enum: ['mtn', 'airtel', 'bank', 'all', ''], default: '' },
  },

  // Delivery settings
  delivery: {
    offersDelivery: { type: Boolean, default: false },
    offersPickup: { type: Boolean, default: false },
    freeDeliveryThreshold: { type: Number, default: 0 }, // min order for free delivery (UGX)
    processingDays: { type: Number, default: 1 },
    // Terminals/locations this seller ships from or drops off at
    terminals: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeliveryTerminal'
    }],
    // Custom delivery zones with fees
    zones: [{
      name: { type: String },
      fee: { type: Number, default: 0 },
      estimatedDays: { type: String },
      active: { type: Boolean, default: true }
    }],
    notes: { type: String, trim: true }
  },

  // Seller metrics
  metrics: {
    totalProducts: {
      type: Number,
      default: 0
    },
    totalSales: {
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
    }
  }
}, {
  timestamps: true
});

// Hash password before saving
sellerSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
sellerSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate verification token
sellerSchema.methods.generateVerificationToken = function() {
  const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  this.verificationToken = token;
  return token;
};

// Generate reset password token
sellerSchema.methods.generateResetPasswordToken = function() {
  const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  this.resetPasswordToken = token;
  this.resetPasswordExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  return token;
};

module.exports = mongoose.model('Seller', sellerSchema);