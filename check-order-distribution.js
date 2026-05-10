/**
 * Check order and distribution data
 * Run: node check-order-distribution.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  userId: { type: String },
  orderRef: { type: String, index: true },
  sellerId: { type: String },
  items: [{
    productId: String,
    name: String,
    price: Number,
    quantity: Number,
    image: String,
    currency: String,
  }],
  delivery: {
    type: { type: String },
    name: String,
    fee: Number,
    estimatedDays: String,
  },
  paymentMethod: String,
  paymentStatus: { type: String, default: 'pending' },
  status: { type: String, default: 'pending' },
  subtotal: Number,
  deliveryFee: Number,
  customerInfo: {
    fullName: String,
    phone: String,
    address: String,
    city: String,
    notes: String,
  },
  buyerInfo: {
    userId: String,
    name: String,
    email: String,
    phone: String,
  },
  proofImages: [{
    url: String,
    fileId: String,
    uploadedAt: { type: Date, default: Date.now },
  }],
  refundDetails: {
    method: String,
    reference: String,
    notes: String,
    refundNumber: String,
    completedAt: Date,
    proofImages: [{
      url: String,
      fileId: String,
    }],
  },
}, { timestamps: true });

const CustomerOrder = mongoose.model('CustomerOrder', orderSchema);

const applicationSchema = new mongoose.Schema({
  appName: String,
  distribution: {
    instant_download: {
      enabled: { type: Boolean, default: false },
      url: { type: String, trim: true },
      note: { type: String, trim: true }
    },
    email_delivery: {
      enabled: { type: Boolean, default: false },
      url: { type: String, trim: true },
      note: { type: String, trim: true }
    },
    github_access: {
      enabled: { type: Boolean, default: false },
      url: { type: String, trim: true },
      note: { type: String, trim: true }
    },
    whatsapp: {
      enabled: { type: Boolean, default: false },
      url: { type: String, trim: true },
      note: { type: String, trim: true }
    },
    google_drive: {
      enabled: { type: Boolean, default: false },
      url: { type: String, trim: true },
      note: { type: String, trim: true }
    },
    custom: {
      enabled: { type: Boolean, default: false },
      url: { type: String, trim: true },
      note: { type: String, trim: true }
    },
    emailNotification: { type: Boolean, default: true },
    processingTime: { type: String, default: 'Within 5 mins' },
    globalNote: { type: String, trim: true }
  }
}, { timestamps: true });

const Application = mongoose.model('Application', applicationSchema);

async function checkOrderDistribution() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get the most recent paid order
    const recentOrder = await CustomerOrder.findOne({ paymentStatus: 'paid' })
      .sort({ createdAt: -1 });

    if (!recentOrder) {
      console.log('❌ No paid orders found');
      return;
    }

    console.log('📦 Recent Paid Order:');
    console.log('Order ID:', recentOrder._id.toString());
    console.log('Payment Status:', recentOrder.paymentStatus);
    console.log('Created:', recentOrder.createdAt);
    console.log('\n📋 Order Items:');
    
    for (const item of recentOrder.items) {
      console.log('\n  Item:', item.name);
      console.log('  Product ID:', item.productId);
      console.log('  Price:', item.price, item.currency || 'USD');
      
      if (item.productId) {
        // Check if this is a valid ObjectId
        if (mongoose.Types.ObjectId.isValid(item.productId)) {
          console.log('  ✅ Product ID is valid ObjectId');
          
          // Try to find the application
          const app = await Application.findById(item.productId);
          if (app) {
            console.log('  ✅ Application found:', app.appName);
            console.log('  📦 Distribution settings:');
            
            if (app.distribution) {
              console.log('    - Instant Download:', app.distribution.instant_download?.enabled ? '✅ Enabled' : '❌ Disabled');
              if (app.distribution.instant_download?.enabled) {
                console.log('      URL:', app.distribution.instant_download.url || 'NOT SET');
                console.log('      Note:', app.distribution.instant_download.note || 'NOT SET');
              }
              
              console.log('    - GitHub Access:', app.distribution.github_access?.enabled ? '✅ Enabled' : '❌ Disabled');
              if (app.distribution.github_access?.enabled) {
                console.log('      URL:', app.distribution.github_access.url || 'NOT SET');
                console.log('      Note:', app.distribution.github_access.note || 'NOT SET');
              }
              
              console.log('    - Google Drive:', app.distribution.google_drive?.enabled ? '✅ Enabled' : '❌ Disabled');
              if (app.distribution.google_drive?.enabled) {
                console.log('      URL:', app.distribution.google_drive.url || 'NOT SET');
                console.log('      Note:', app.distribution.google_drive.note || 'NOT SET');
              }
              
              console.log('    - WhatsApp:', app.distribution.whatsapp?.enabled ? '✅ Enabled' : '❌ Disabled');
              if (app.distribution.whatsapp?.enabled) {
                console.log('      URL:', app.distribution.whatsapp.url || 'NOT SET');
                console.log('      Note:', app.distribution.whatsapp.note || 'NOT SET');
              }
              
              console.log('    - Email Delivery:', app.distribution.email_delivery?.enabled ? '✅ Enabled' : '❌ Disabled');
              if (app.distribution.email_delivery?.enabled) {
                console.log('      Note:', app.distribution.email_delivery.note || 'NOT SET');
              }
              
              console.log('    - Custom Method:', app.distribution.custom?.enabled ? '✅ Enabled' : '❌ Disabled');
              if (app.distribution.custom?.enabled) {
                console.log('      URL:', app.distribution.custom.url || 'NOT SET');
                console.log('      Note:', app.distribution.custom.note || 'NOT SET');
              }
              
              console.log('    - Processing Time:', app.distribution.processingTime || 'NOT SET');
              console.log('    - Global Note:', app.distribution.globalNote || 'NOT SET');
              
              // Check if ANY method is enabled
              const hasAnyEnabled = 
                app.distribution.instant_download?.enabled ||
                app.distribution.github_access?.enabled ||
                app.distribution.google_drive?.enabled ||
                app.distribution.whatsapp?.enabled ||
                app.distribution.email_delivery?.enabled ||
                app.distribution.custom?.enabled;
              
              if (!hasAnyEnabled) {
                console.log('\n  ⚠️  WARNING: No distribution methods are enabled!');
              }
            } else {
              console.log('  ❌ No distribution settings found');
            }
          } else {
            console.log('  ❌ Application not found in database');
          }
        } else {
          console.log('  ❌ Product ID is NOT a valid ObjectId');
        }
      } else {
        console.log('  ❌ No Product ID in order item');
      }
    }

    console.log('\n\n🔍 Testing API endpoint:');
    if (recentOrder.items[0]?.productId) {
      const testId = recentOrder.items[0].productId;
      console.log(`GET /api/applications/${testId}/distribution`);
      
      if (mongoose.Types.ObjectId.isValid(testId)) {
        const app = await Application.findById(testId);
        if (app) {
          console.log('✅ Would return:', JSON.stringify(app.distribution || {}, null, 2));
        } else {
          console.log('❌ Application not found');
        }
      } else {
        console.log('❌ Invalid ObjectId');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

checkOrderDistribution();
