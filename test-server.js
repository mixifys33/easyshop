// Simple test to verify server starts without syntax errors
const express = require('express');

console.log('🧪 Testing server startup...');

try {
  // Test importing all route files
  console.log('📁 Testing route imports...');
  
  const productRoutes = require('./routes/products');
  console.log('✅ Product routes imported successfully');
  
  const sellerRoutes = require('./routes/sellers');
  console.log('✅ Seller routes imported successfully');
  
  const draftRoutes = require('./routes/drafts');
  console.log('✅ Draft routes imported successfully');
  
  const categoryRoutes = require('./routes/categories');
  console.log('✅ Category routes imported successfully');
  
  console.log('\n🎉 All route files imported successfully!');
  console.log('✅ No syntax errors detected');
  console.log('🚀 Server should start properly now');
  
} catch (error) {
  console.error('❌ Error importing routes:', error.message);
  console.error('📍 Error location:', error.stack);
  process.exit(1);
}