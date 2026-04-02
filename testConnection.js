const http = require('http');

console.log('🔍 Testing Backend Connection...\n');

// Test if server is running
const testConnection = () => {
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/sellers/admin/sellers/count',
    method: 'GET'
  };

  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log('✅ Backend server is running successfully!');
        console.log('✅ API endpoints are accessible');
        console.log('✅ Ready to accept registration requests');
        console.log('\n📊 Server Response:', JSON.parse(data));
        console.log('\n🚀 You can now test the frontend registration!');
      } else {
        console.log('❌ Server responded with status:', res.statusCode);
        console.log('Response:', data);
      }
    });
  });

  req.on('error', (error) => {
    console.log('❌ Cannot connect to backend server');
    console.log('Error:', error.message);
    console.log('\n💡 Make sure to start the backend server:');
    console.log('   cd backend');
    console.log('   node server.js');
  });

  req.end();
};

testConnection();