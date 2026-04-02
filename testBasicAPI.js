const fetch = require('node-fetch');

const testBasicEndpoints = async () => {
  try {
    console.log('🧪 Testing Basic API Endpoints...\n');
    
    // Test health endpoint
    console.log('1. Testing health endpoint...');
    try {
      const healthResponse = await fetch('http://localhost:3000/api/health');
      const healthData = await healthResponse.json();
      console.log(`   ✅ Health: ${healthData.message}`);
    } catch (error) {
      console.log(`   ❌ Health endpoint failed: ${error.message}`);
      return;
    }
    
    // Test products list endpoint
    console.log('\n2. Testing products list endpoint...');
    try {
      const productsResponse = await fetch('http://localhost:3000/api/products');
      const productsData = await productsResponse.json();
      console.log(`   ✅ Products: Found ${productsData.products?.length || 0} products`);
      
      if (productsData.products && productsData.products.length > 0) {
        const firstProduct = productsData.products[0];
        console.log(`   📱 First product: ${firstProduct.title} (ID: ${firstProduct._id})`);
        
        // Test single product endpoint
        console.log('\n3. Testing single product endpoint...');
        try {
          const singleResponse = await fetch(`http://localhost:3000/api/products/${firstProduct._id}`);
          const singleData = await singleResponse.json();
          console.log(`   ✅ Single product: ${singleData.product?.title || 'Not found'}`);
        } catch (error) {
          console.log(`   ❌ Single product failed: ${error.message}`);
        }
        
        // Test related products endpoint
        console.log('\n4. Testing related products endpoint...');
        try {
          const relatedResponse = await fetch(`http://localhost:3000/api/products/${firstProduct._id}/related`);
          console.log(`   Response status: ${relatedResponse.status}`);
          
          if (relatedResponse.ok) {
            const relatedData = await relatedResponse.json();
            console.log(`   ✅ Related products: Found ${relatedData.count || 0} products`);
          } else {
            const errorText = await relatedResponse.text();
            console.log(`   ❌ Related products failed: ${relatedResponse.status} - ${errorText}`);
          }
        } catch (error) {
          console.log(`   ❌ Related products request failed: ${error.message}`);
        }
      }
    } catch (error) {
      console.log(`   ❌ Products endpoint failed: ${error.message}`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
};

testBasicEndpoints();