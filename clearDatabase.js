const http = require('http');

const clearDatabase = async () => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/sellers/admin/clear-all',
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    console.log('🗑️  Clearing all seller data from database...\n');

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (res.statusCode === 200) {
            console.log('✅ SUCCESS: Database cleared successfully!');
            console.log('📊 Result:', result.message);
            if (result.warning) {
              console.log('⚠️  Warning:', result.warning);
            }
            console.log('\n🔄 Database is now completely empty and ready for fresh data.');
            console.log('\n💡 You can now:');
            console.log('   • Register new seller accounts');
            console.log('   • Test the registration flow from scratch');
            console.log('   • Use the test credentials will be recreated automatically');
            resolve(result);
          } else {
            console.log('❌ ERROR: Failed to clear database');
            console.log('Status:', res.statusCode);
            console.log('Response:', result);
            reject(new Error(result.error || 'Unknown error'));
          }
        } catch (error) {
          console.log('❌ ERROR: Invalid response from server');
          console.log('Raw response:', data);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.log('❌ CONNECTION ERROR: Could not connect to backend server');
      console.log('Error:', error.message);
      console.log('\n💡 Make sure:');
      console.log('   • Backend server is running on http://localhost:3000');
      console.log('   • Run "npm start" or "node server.js" in the backend directory');
      reject(error);
    });

    req.end();
  });
};

// Run the clear operation
clearDatabase()
  .then(() => {
    console.log('\n🎉 Database reset completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.log('\n💥 Database reset failed:', error.message);
    process.exit(1);
  });