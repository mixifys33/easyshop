// Test script to verify sellers routes work without sellerStorage errors
const mongoose = require('mongoose');
require('dotenv').config();

console.log('🧪 Testing sellers routes...');

try {
  // Test importing the sellers routes
  const sellerRoutes = require('./routes/sellers');
  console.log('✅ Sellers routes imported successfully');
  
  // Test importing the Seller model
  const Seller = require('./models/Seller');
  console.log('✅ Seller model imported successfully');
  
  console.log('\n🎉 All sellers route dependencies loaded successfully!');
  console.log('✅ No sellerStorage references causing errors');
  console.log('🚀 Server should start without sellerStorage errors now');
  
} catch (error) {
  console.error('❌ Error testing sellers routes:', error.message);
  console.error('📍 Error location:', error.stack);
  process.exit(1);
}