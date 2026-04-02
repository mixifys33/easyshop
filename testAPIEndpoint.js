const fetch = require('node-fetch');

// Test the related products API endpoint
const testRelatedProductsEndpoint = async () => {
  try {
    console.log('🧪 Testing Related Products API Endpoint...\n');
    
    // First, get a list of products to test with
    console.log('📋 Getting list of products...');
    const productsResponse = await fetch('http://localhost:3000/api/products');
    
    if (!productsResponse.ok) {
      throw new Error(`Failed to fetch products: ${productsResponse.status} ${productsResponse.statusText}`);
    }
    
    const productsData = await productsResponse.json();
    
    if (!productsData.success || !productsData.products || productsData.products.length === 0) {
      console.log('❌ No products found to test with');
      return;
    }
    
    console.log(`✅ Found ${productsData.products.length} products`);
    
    // Test with the first product
    const testProduct = productsData.products[0];
    console.log(`\n🔍 Testing related products for: ${testProduct.title}`);
    console.log(`   ID: ${testProduct._id}`);
    console.log(`   Category: ${testProduct.category} > ${testProduct.subCategory}`);
    
    // Test the related products endpoint
    const relatedResponse = await fetch(`http://localhost:3000/api/products/${testProduct._id}/related?limit=6`);
    
    if (!relatedResponse.ok) {
      throw new Error(`Failed to fetch related products: ${relatedResponse.status} ${relatedResponse.statusText}`);
    }
    
    const relatedData = await relatedResponse.json();
    
    console.log('\n📤 API Response:');
    console.log(`   Success: ${relatedData.success}`);
    console.log(`   Products Count: ${relatedData.count}`);
    console.log(`   Current Product ID: ${relatedData.currentProduct?.id}`);
    
    if (relatedData.success && relatedData.products && relatedData.products.length > 0) {
      console.log('\n🎯 Related Products Found:');
      relatedData.products.forEach((product, index) => {
        console.log(`   ${index + 1}. ${product.name}`);
        console.log(`      Category: ${product.category} > ${product.subCategory}`);
        console.log(`      Price: UGX ${product.price.toLocaleString()}`);
        console.log(`      Match Score: ${product.matchScore}`);
        console.log(`      Image: ${product.image ? 'Available' : 'No image'}`);
        console.log('');
      });
      
      // Analyze match quality
      const exactMatches = relatedData.products.filter(p => p.matchScore === 30).length;
      const subCategoryMatches = relatedData.products.filter(p => p.matchScore === 20).length;
      const categoryMatches = relatedData.products.filter(p => p.matchScore === 10).length;
      const noMatches = relatedData.products.filter(p => p.matchScore === 0).length;
      
      console.log('📊 Match Quality Analysis:');
      console.log(`   Exact matches (same category + subcategory): ${exactMatches}`);
      console.log(`   SubCategory matches: ${subCategoryMatches}`);
      console.log(`   Category matches: ${categoryMatches}`);
      console.log(`   No category matches: ${noMatches}`);
      
      console.log('\n✅ Related Products API endpoint is working correctly!');
    } else {
      console.log('⚠️  No related products returned by API');
    }
    
  } catch (error) {
    console.error('❌ Error testing API endpoint:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Make sure the backend server is running on port 3000');
      console.log('   Run: cd backend && npm start');
    }
  }
};

// Test multiple products
const testMultipleProducts = async () => {
  try {
    console.log('\n🔄 Testing with multiple products...\n');
    
    // Get products
    const productsResponse = await fetch('http://localhost:3000/api/products');
    const productsData = await productsResponse.json();
    
    if (!productsData.success || !productsData.products) {
      console.log('❌ Could not fetch products for multiple tests');
      return;
    }
    
    // Test with first 3 products
    const testProducts = productsData.products.slice(0, 3);
    
    for (const product of testProducts) {
      console.log(`🔍 Testing: ${product.title} (${product.category} > ${product.subCategory})`);
      
      try {
        const response = await fetch(`http://localhost:3000/api/products/${product._id}/related?limit=4`);
        const data = await response.json();
        
        if (data.success) {
          console.log(`   ✅ Found ${data.count} related products`);
          
          if (data.products.length > 0) {
            const bestMatch = data.products[0];
            console.log(`   🎯 Best match: ${bestMatch.name} (Score: ${bestMatch.matchScore})`);
          }
        } else {
          console.log(`   ❌ API returned error: ${data.message}`);
        }
      } catch (error) {
        console.log(`   ❌ Request failed: ${error.message}`);
      }
      
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ Error in multiple product test:', error.message);
  }
};

// Main execution
const main = async () => {
  console.log('🚀 Starting API Endpoint Tests\n');
  
  await testRelatedProductsEndpoint();
  await testMultipleProducts();
  
  console.log('\n🏁 API endpoint tests complete!');
};

// Run the tests
main();