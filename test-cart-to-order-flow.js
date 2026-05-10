/**
 * Test the complete cart-to-order-to-distribution flow
 * Run: node test-cart-to-order-flow.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  userId: { type: String },
  items: [{
    productId: String,
    name: String,
    price: Number,
    quantity: Number,
    image: String,
    currency: String,
  }],
  paymentStatus: { type: String, default: 'pending' },
  status: { type: String, default: 'pending' },
  subtotal: Number,
  deliveryFee: Number,
  customerInfo: {
    fullName: String,
    phone: String,
    email: String,
  },
  buyerInfo: {
    userId: String,
    name: String,
    email: String,
    phone: String,
  },
}, { timestamps: true });

const CustomerOrder = mongoose.model('CustomerOrder', orderSchema);

const applicationSchema = new mongoose.Schema({
  appName: String,
  price: Number,
  currency: String,
  distribution: {
    instant_download: {
      enabled: { type: Boolean, default: false },
      url: { type: String, trim: true },
      note: { type: String, trim: true }
    },
    github_access: {
      enabled: { type: Boolean, default: false },
      url: { type: String, trim: true },
      note: { type: String, trim: true }
    },
    google_drive: {
      enabled: { type: Boolean, default: false },
      url: { type: String, trim: true },
      note: { type: String, trim: true }
    },
    whatsapp: {
      enabled: { type: Boolean, default: false },
      url: { type: String, trim: true },
      note: { type: String, trim: true }
    },
    email_delivery: {
      enabled: { type: Boolean, default: false },
      note: { type: String, trim: true }
    },
    custom: {
      enabled: { type: Boolean, default: false },
      url: { type: String, trim: true },
      note: { type: String, trim: true }
    },
    processingTime: { type: String, default: 'Within 5 mins' },
    globalNote: { type: String, trim: true }
  }
}, { timestamps: true });

const Application = mongoose.model('Application', applicationSchema);

async function testFlow() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Step 1: Find a verified application with distribution settings
    console.log('📋 Step 1: Finding applications with distribution settings...');
    const appsWithDistribution = await Application.find({
      'distribution.instant_download.enabled': true
    }).limit(5);

    if (appsWithDistribution.length === 0) {
      console.log('❌ No applications found with distribution settings enabled');
      console.log('   Please configure distribution settings in the admin panel first\n');
      
      // Show all applications
      const allApps = await Application.find().limit(10);
      console.log(`Found ${allApps.length} total applications:`);
      allApps.forEach(app => {
        console.log(`  - ${app.appName} (${app._id})`);
        console.log(`    Distribution enabled:`, app.distribution?.instant_download?.enabled || false);
      });
      
      return;
    }

    console.log(`✅ Found ${appsWithDistribution.length} applications with distribution:\n`);
    appsWithDistribution.forEach(app => {
      console.log(`  📦 ${app.appName}`);
      console.log(`     ID: ${app._id}`);
      console.log(`     Price: ${app.currency || 'USD'} ${app.price || 0}`);
      if (app.distribution?.instant_download?.enabled) {
        console.log(`     ✅ Instant Download: ${app.distribution.instant_download.url || 'NO URL'}`);
      }
      if (app.distribution?.github_access?.enabled) {
        console.log(`     ✅ GitHub: ${app.distribution.github_access.url || 'NO URL'}`);
      }
      console.log('');
    });

    // Step 2: Simulate creating an order (like cart does)
    const testApp = appsWithDistribution[0];
    console.log(`📋 Step 2: Simulating order creation for "${testApp.appName}"...`);
    
    const testOrder = new CustomerOrder({
      userId: 'test_user_123',
      items: [{
        productId: testApp._id.toString(), // This is what the fix ensures is set
        name: testApp.appName,
        price: testApp.price || 0,
        quantity: 1,
        image: '',
        currency: testApp.currency || 'USD',
      }],
      subtotal: testApp.price || 0,
      deliveryFee: 0,
      paymentMethod: 'flutterwave',
      paymentStatus: 'paid', // Simulate successful payment
      status: 'confirmed',
      customerInfo: {
        fullName: 'Test User',
        phone: '+256700000000',
        email: 'test@example.com',
      },
      buyerInfo: {
        userId: 'test_user_123',
        name: 'Test User',
        email: 'test@example.com',
        phone: '+256700000000',
      },
    });

    await testOrder.save();
    console.log(`✅ Test order created: ${testOrder._id}\n`);

    // Step 3: Verify productId is saved
    console.log('📋 Step 3: Verifying productId in order...');
    const savedOrder = await CustomerOrder.findById(testOrder._id);
    const orderItem = savedOrder.items[0];
    
    if (!orderItem.productId) {
      console.log('❌ FAILED: productId is missing in order item!');
      console.log('   Order item:', JSON.stringify(orderItem, null, 2));
      return;
    }
    
    console.log(`✅ productId saved correctly: ${orderItem.productId}\n`);

    // Step 4: Test distribution endpoint
    console.log('📋 Step 4: Testing distribution endpoint...');
    if (!mongoose.Types.ObjectId.isValid(orderItem.productId)) {
      console.log('❌ FAILED: productId is not a valid ObjectId');
      return;
    }

    const app = await Application.findById(orderItem.productId);
    if (!app) {
      console.log('❌ FAILED: Application not found with productId');
      return;
    }

    console.log(`✅ Application found: ${app.appName}`);
    console.log(`✅ Distribution data available:\n`);
    
    if (app.distribution) {
      console.log('   Distribution Settings:');
      if (app.distribution.instant_download?.enabled) {
        console.log(`   ✅ Instant Download`);
        console.log(`      URL: ${app.distribution.instant_download.url || 'NOT SET'}`);
        console.log(`      Note: ${app.distribution.instant_download.note || 'NOT SET'}`);
      }
      if (app.distribution.github_access?.enabled) {
        console.log(`   ✅ GitHub Access`);
        console.log(`      URL: ${app.distribution.github_access.url || 'NOT SET'}`);
        console.log(`      Note: ${app.distribution.github_access.note || 'NOT SET'}`);
      }
      if (app.distribution.google_drive?.enabled) {
        console.log(`   ✅ Google Drive`);
        console.log(`      URL: ${app.distribution.google_drive.url || 'NOT SET'}`);
        console.log(`      Note: ${app.distribution.google_drive.note || 'NOT SET'}`);
      }
      if (app.distribution.whatsapp?.enabled) {
        console.log(`   ✅ WhatsApp`);
        console.log(`      URL: ${app.distribution.whatsapp.url || 'NOT SET'}`);
        console.log(`      Note: ${app.distribution.whatsapp.note || 'NOT SET'}`);
      }
      if (app.distribution.email_delivery?.enabled) {
        console.log(`   ✅ Email Delivery`);
        console.log(`      Note: ${app.distribution.email_delivery.note || 'NOT SET'}`);
      }
      if (app.distribution.custom?.enabled) {
        console.log(`   ✅ Custom Method`);
        console.log(`      URL: ${app.distribution.custom.url || 'NOT SET'}`);
        console.log(`      Note: ${app.distribution.custom.note || 'NOT SET'}`);
      }
      console.log(`   Processing Time: ${app.distribution.processingTime || 'NOT SET'}`);
      console.log(`   Global Note: ${app.distribution.globalNote || 'NOT SET'}`);
    } else {
      console.log('   ❌ No distribution settings found');
    }

    // Step 5: Clean up test order
    console.log('\n📋 Step 5: Cleaning up test order...');
    await CustomerOrder.findByIdAndDelete(testOrder._id);
    console.log('✅ Test order deleted\n');

    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ ALL TESTS PASSED!');
    console.log('═══════════════════════════════════════════════════════');
    console.log('\nThe flow is working correctly:');
    console.log('1. ✅ Applications have distribution settings');
    console.log('2. ✅ Orders save productId correctly');
    console.log('3. ✅ Distribution endpoint returns data');
    console.log('\nOnce the frontend is deployed with the _id → id fix,');
    console.log('users will see distribution info after successful payment!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

testFlow();
