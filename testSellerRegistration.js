// Using built-in fetch (Node.js 18+)

const testRegistration = async () => {
  try {
    console.log('🧪 Testing Seller Registration...\n');
    
    // Test data
    const testSeller = {
      name: 'Test User',
      email: 'testuser' + Date.now() + '@example.com',
      phoneNumber: '+256700123456',
      password: 'TestPass123!'
    };
    
    console.log('📝 Registering seller with email:', testSeller.email);
    
    // Test registration
    const response = await fetch('http://localhost:3000/api/sellers/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testSeller),
    });
    
    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Registration successful!');
      console.log('📧 Check console for OTP (in real app, check email)');
    } else {
      console.log('❌ Registration failed:', data.error || data.message);
    }
    
    // Test clearing data
    console.log('\n🧹 Testing clear backend data...');
    const clearResponse = await fetch('http://localhost:3000/api/sellers/admin/clear-all', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    const clearData = await clearResponse.json();
    
    if (clearResponse.ok) {
      console.log('✅ Backend data cleared successfully!');
    } else {
      console.log('❌ Failed to clear data:', clearData.error || clearData.message);
    }
    
  } catch (error) {
    console.error('🚨 Test failed:', error.message);
    console.log('💡 Make sure the backend server is running on port 3000');
  }
};

// Run the test
testRegistration();