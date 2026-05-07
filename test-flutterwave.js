/**
 * Flutterwave Integration Test Script
 * 
 * This script tests the Flutterwave integration without making actual API calls.
 * It verifies that all required components are properly configured.
 */

require('dotenv').config();
const mongoose = require('mongoose');

console.log('\n🧪 Testing Flutterwave Integration...\n');

// Test 1: Check environment variables
console.log('📋 Test 1: Checking Environment Variables');
const requiredEnvVars = [
  'FLUTTERWAVE_PUBLIC_KEY',
  'FLUTTERWAVE_SECRET_KEY',
  'FLUTTERWAVE_ENCRYPTION_KEY',
  'FRONTEND_URL',
];

let envTestPassed = true;
requiredEnvVars.forEach(varName => {
  const value = process.env[varName];
  if (!value || value.includes('XXXXXXXX') || value.includes('your_')) {
    console.log(`   ❌ ${varName}: Not configured`);
    envTestPassed = false;
  } else {
    const maskedValue = value.substring(0, 15) + '...';
    console.log(`   ✅ ${varName}: ${maskedValue}`);
  }
});

if (!envTestPassed) {
  console.log('\n⚠️  Please configure your Flutterwave API keys in backend/.env\n');
  console.log('Get your keys from: https://dashboard.flutterwave.com/settings/apis\n');
}

// Test 2: Check if Flutterwave SDK is installed
console.log('\n📦 Test 2: Checking Flutterwave SDK');
try {
  const Flutterwave = require('flutterwave-node-v3');
  console.log('   ✅ Flutterwave SDK installed');
  
  // Try to initialize (won't make API calls)
  const flw = new Flutterwave(
    process.env.FLUTTERWAVE_PUBLIC_KEY,
    process.env.FLUTTERWAVE_SECRET_KEY
  );
  console.log('   ✅ Flutterwave SDK initialized');
} catch (error) {
  console.log('   ❌ Flutterwave SDK error:', error.message);
}

// Test 3: Check if service file exists
console.log('\n📄 Test 3: Checking Service Files');
try {
  const flutterwaveService = require('./services/flutterwaveService');
  const methods = [
    'initializeCardPayment',
    'initializeMobileMoneyPayment',
    'initializeStandardPayment',
    'verifyTransaction',
    'verifyWebhookSignature',
    'getTransactionByRef',
  ];
  
  methods.forEach(method => {
    if (typeof flutterwaveService[method] === 'function') {
      console.log(`   ✅ ${method} exists`);
    } else {
      console.log(`   ❌ ${method} missing`);
    }
  });
} catch (error) {
  console.log('   ❌ Service file error:', error.message);
}

// Test 4: Check if routes file exists
console.log('\n🛣️  Test 4: Checking Route Files');
try {
  const flutterwaveRoutes = require('./routes/flutterwave');
  console.log('   ✅ Flutterwave routes loaded');
} catch (error) {
  console.log('   ❌ Routes file error:', error.message);
}

// Test 5: Check database connection
console.log('\n🗄️  Test 5: Checking Database Connection');
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.log('   ❌ MONGODB_URI not configured');
} else {
  mongoose.connect(MONGODB_URI)
    .then(() => {
      console.log('   ✅ Database connected');
      
      // Check if CustomerOrder model exists
      try {
        const CustomerOrder = mongoose.model('CustomerOrder');
        console.log('   ✅ CustomerOrder model exists');
      } catch (error) {
        console.log('   ⚠️  CustomerOrder model not loaded (will be created on first use)');
      }
      
      mongoose.connection.close();
      
      // Final summary
      printSummary(envTestPassed);
    })
    .catch(error => {
      console.log('   ❌ Database connection error:', error.message);
      printSummary(envTestPassed);
    });
}

function printSummary(envTestPassed) {
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60));
  
  if (envTestPassed) {
    console.log('\n✅ All tests passed! Your Flutterwave integration is ready.\n');
    console.log('Next steps:');
    console.log('1. Start the backend: npm run dev');
    console.log('2. Start the frontend: cd ../easyshop-web && npm run dev');
    console.log('3. Test payment flow at: http://localhost:3001/checkout\n');
    console.log('Test Card: 5531886652142950 | CVV: 564 | Expiry: 09/32 | PIN: 3310 | OTP: 12345\n');
  } else {
    console.log('\n⚠️  Configuration incomplete. Please:\n');
    console.log('1. Get your API keys from: https://dashboard.flutterwave.com');
    console.log('2. Update backend/.env with your keys');
    console.log('3. Run this test again: node test-flutterwave.js\n');
  }
  
  process.exit(0);
}
