const bcrypt = require('bcryptjs');

// This script creates a test seller account for testing login functionality
// Run this script to create a test account: node createTestSeller.js

const createTestSeller = async () => {
  const testSeller = {
    id: 'seller_test_123',
    name: 'Test Seller',
    email: 'test@seller.com',
    phoneNumber: '+256700000000',
    password: await bcrypt.hash('Test123!', 12), // Password: Test123!
    verified: true,
    createdAt: new Date().toISOString()
  };

  console.log('Test Seller Account Created:');
  console.log('Email: test@seller.com');
  console.log('Password: Test123!');
  console.log('');
  console.log('You can use these credentials to test the login functionality.');
  console.log('');
  console.log('Seller Data:', JSON.stringify(testSeller, null, 2));

  return testSeller;
};

// Export for use in other files
module.exports = { createTestSeller };

// Run if called directly
if (require.main === module) {
  createTestSeller();
}