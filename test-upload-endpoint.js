const FormData = require('form-data');
const fs = require('fs');
const fetch = require('node-fetch');
const path = require('path');

async function testUploadEndpoint() {
  try {
    console.log('Testing bulk upload endpoint...');
    
    // Create a test CSV file
    const testCSV = `Product Name,SKU,Short Description,Regular Price,Sale Price,Stock,Category
iPhone 14,IP14-001,Latest iPhone with advanced features,999000,899000,50,Electronics
Samsung Galaxy S23,SG23-002,Premium Android smartphone,850000,750000,30,Electronics`;

    const testFilePath = path.join(__dirname, 'test-upload.csv');
    fs.writeFileSync(testFilePath, testCSV);
    
    // Create FormData
    const formData = new FormData();
    formData.append('file', fs.createReadStream(testFilePath), {
      filename: 'test-upload.csv',
      contentType: 'text/csv'
    });
    
    console.log('Sending request to backend...');
    
    // Send request
    const response = await fetch('http://localhost:3000/api/products/bulk-upload/parse', {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders()
    });
    
    console.log('Response status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Success!');
      console.log('Headers:', data.headers);
      console.log('Data rows:', data.data.length);
      console.log('Sample data:', data.data[0]);
      
      // Check for both price columns
      const hasRegularPrice = data.headers.includes('Regular Price');
      const hasSalePrice = data.headers.includes('Sale Price');
      
      console.log('\n📊 Price Column Check:');
      console.log('Regular Price found:', hasRegularPrice ? '✅' : '❌');
      console.log('Sale Price found:', hasSalePrice ? '✅' : '❌');
      
    } else {
      const errorText = await response.text();
      console.error('❌ Error:', response.status, errorText);
    }
    
    // Clean up
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run test
testUploadEndpoint();