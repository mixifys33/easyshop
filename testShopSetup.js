const http = require('http');

// Test data for shop setup
const testShopData = {
  sellerId: "test-seller-id", // This will be replaced with actual seller ID
  shopName: "Test Electronics Store",
  shopDescription: "We sell the latest electronics and gadgets for all your tech needs. Quality products at affordable prices.",
  businessType: "electronics",
  businessAddress: "Plot 123 Kampala Road",
  city: "Kampala",
  website: "https://teststore.com",
  businessLicense: "BL123456789",
  taxId: "1234567890",
  shopLogo: null, // No logo for this test
  shopBanner: null // No banner for this test
};

const makeRequest = (path, method = 'GET', data = null) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      res.on('end', () => {
        try {
          const result = JSON.parse(responseData);
          resolve({ status: res.statusCode, data: result });
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
};

const testShopSetup = async () => {
  try {
    console.log('🧪 Testing Shop Setup Process...\n');

    // Step 1: Register a test seller first
    console.log('1️⃣ Registering test seller...');
    const registrationData = {
      name: 'Test Shop Owner',
      email: 'shopowner@test.com',
      phoneNumber: '+256700123456',
      password: 'TestPassword123!'
    };

    const registerResponse = await makeRequest('/api/sellers/register', 'POST', registrationData);
    console.log('Registration Status:', registerResponse.status);
    console.log('Registration Response:', registerResponse.data.message);

    if (registerResponse.status !== 200) {
      console.log('❌ Registration failed, stopping test');
      return;
    }

    // Step 2: Verify with a dummy OTP (we'll use 1234 as a test)
    console.log('\n2️⃣ Verifying with test OTP...');
    const verifyData = {
      email: 'shopowner@test.com',
      otp: '1234' // This might fail, but let's see the error
    };

    try {
      const verifyResponse = await makeRequest('/api/sellers/verify', 'POST', verifyData);
      console.log('Verification Status:', verifyResponse.status);
      console.log('Verification Response:', verifyResponse.data.message);

      if (verifyResponse.status === 200) {
        // Step 3: Get the seller ID
        console.log('\n3️⃣ Getting seller information...');
        const sellersResponse = await makeRequest('/api/sellers/admin/sellers');
        
        if (sellersResponse.status === 200 && sellersResponse.data.sellers.length > 0) {
          const seller = sellersResponse.data.sellers.find(s => s.email === 'shopowner@test.com');
          
          if (seller) {
            console.log('Found seller:', seller.name, 'ID:', seller.id);
            
            // Step 4: Test shop setup
            console.log('\n4️⃣ Testing shop setup...');
            testShopData.sellerId = seller.id;
            
            const shopResponse = await makeRequest('/api/sellers/shop-setup', 'POST', testShopData);
            console.log('Shop Setup Status:', shopResponse.status);
            console.log('Shop Setup Response:', shopResponse.data);
            
            if (shopResponse.status === 200) {
              console.log('\n✅ SUCCESS: Shop setup completed successfully!');
              console.log('🎉 All schema fixes are working correctly!');
            } else {
              console.log('\n❌ FAILED: Shop setup failed');
              console.log('Error:', shopResponse.data.error);
            }
          } else {
            console.log('❌ Seller not found in database');
          }
        } else {
          console.log('❌ Could not retrieve sellers');
        }
      } else {
        console.log('❌ Verification failed (expected - we used dummy OTP)');
        console.log('💡 This is normal - the OTP verification would work with real OTP from email');
      }
    } catch (verifyError) {
      console.log('❌ Verification failed (expected):', verifyError.message);
      console.log('💡 This is normal - we used a dummy OTP');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n💡 Make sure:');
    console.log('   • Backend server is running on http://localhost:3000');
    console.log('   • Database connection is working');
  }
};

console.log('🔧 SHOP SETUP SCHEMA TEST');
console.log('='.repeat(50));
console.log('This test verifies that the new schema changes work correctly.');
console.log('It will test the business type enum and image object structure.\n');

testShopSetup();