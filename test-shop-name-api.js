const fetch = require('node-fetch');

async function testShopNameAPI() {
  try {
    console.log('🧪 Testing Shop Name API Response...\n');
    
    // Test 1: Get all products
    console.log('📦 Test 1: Fetching all products...');
    const response = await fetch('http://localhost:3000/api/products');
    const data = await response.json();
    
    if (data.success && data.products && data.products.length > 0) {
      console.log(`✅ Found ${data.products.length} products\n`);
      
      // Check first 3 products
      const productsToCheck = data.products.slice(0, 3);
      
      productsToCheck.forEach((product, index) => {
        console.log(`Product ${index + 1}: ${product.title}`);
        console.log(`  Seller ID Type: ${typeof product.sellerId}`);
        
        if (product.sellerId && typeof product.sellerId === 'object') {
          console.log(`  ✅ Seller is populated (object)`);
          console.log(`  Seller Object Keys:`, Object.keys(product.sellerId));
          
          if (product.sellerId.shop) {
            console.log(`  ✅ Shop object exists`);
            console.log(`  Shop Name: ${product.sellerId.shop.shopName || 'NOT FOUND'}`);
          } else {
            console.log(`  ❌ Shop object NOT found`);
            console.log(`  Seller Data:`, JSON.stringify(product.sellerId, null, 2));
          }
        } else {
          console.log(`  ❌ Seller NOT populated (still an ID)`);
          console.log(`  Seller ID: ${product.sellerId}`);
        }
        console.log('');
      });
      
      // Test the transformation logic
      console.log('🔄 Testing transformation logic...\n');
      const testProduct = data.products[0];
      const shopName = testProduct.sellerId?.shop?.shopName || 
                       testProduct.sellerId?.shopName || 
                       'Unknown Shop';
      console.log(`Transformed Shop Name: ${shopName}`);
      
    } else {
      console.log('❌ No products found or API error');
      console.log('Response:', data);
    }
    
  } catch (error) {
    console.error('❌ Error testing API:', error.message);
  }
}

testShopNameAPI();
