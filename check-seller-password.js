const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const Seller = require('./models/Seller');

async function checkSellerPassword() {
  try {
    console.log('🔍 Checking seller password info...');
    
    // Find the seller
    const seller = await Seller.findOne({ email: 'mixify055@gmail.com' });
    
    if (!seller) {
      console.log('❌ Seller not found');
      return;
    }
    
    console.log('✅ Seller found:', {
      id: seller._id,
      name: seller.name,
      email: seller.email,
      hasPassword: !!seller.password,
      passwordLength: seller.password ? seller.password.length : 0
    });
    
    // Test common passwords
    const testPasswords = ['Test123!', 'password', 'admin123', 'Admin123!'];
    
    for (const testPassword of testPasswords) {
      try {
        const isMatch = await seller.comparePassword(testPassword);
        if (isMatch) {
          console.log(`✅ Current password is: "${testPassword}"`);
          break;
        }
      } catch (error) {
        console.log(`❌ Error testing password "${testPassword}":`, error.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.connection.close();
  }
}

checkSellerPassword();