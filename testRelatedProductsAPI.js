const mongoose = require('mongoose');
const Product = require('./models/Product');

// Load environment variables
require('dotenv').config();

// Database connection
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Test the related products API logic
const testRelatedProductsAPI = async () => {
  try {
    console.log('\n🧪 TESTING RELATED PRODUCTS API LOGIC...\n');
    
    // Get all products to test with
    const allProducts = await Product.find({ status: 'active' }).select('_id title category subCategory');
    
    if (allProducts.length === 0) {
      console.log('❌ No active products found');
      return;
    }
    
    console.log(`📱 Found ${allProducts.length} active products to test with`);
    
    // Test with each product
    for (const testProduct of allProducts) {
      console.log(`\n🔍 Testing related products for: ${testProduct.title}`);
      console.log(`   Category: ${testProduct.category} > ${testProduct.subCategory}`);
      
      // Simulate the API logic
      const pipeline = [
        // Exclude the current product
        { $match: { 
          _id: { $ne: testProduct._id },
          status: 'active',
          stock: { $gt: 0 } // Only products in stock
        }},
        
        // Add scoring based on category match
        { $addFields: {
          categoryScore: {
            $cond: [
              { $eq: ['$category', testProduct.category] }, 
              10, // Same category gets 10 points
              0
            ]
          },
          subCategoryScore: {
            $cond: [
              { $eq: ['$subCategory', testProduct.subCategory] }, 
              20, // Same subcategory gets 20 points (higher priority)
              0
            ]
          },
          totalScore: {
            $add: [
              { $cond: [{ $eq: ['$category', testProduct.category] }, 10, 0] },
              { $cond: [{ $eq: ['$subCategory', testProduct.subCategory] }, 20, 0] }
            ]
          }
        }},
        
        // Sort by score (highest first), then by creation date (newest first)
        { $sort: { totalScore: -1, createdAt: -1 } },
        
        // Limit results
        { $limit: 6 },
        
        // Project only needed fields
        { $project: {
          title: 1,
          salePrice: 1,
          regularPrice: 1,
          images: 1,
          category: 1,
          subCategory: 1,
          stock: 1,
          brand: 1,
          totalScore: 1,
          createdAt: 1
        }}
      ];
      
      const relatedProducts = await Product.aggregate(pipeline);
      
      console.log(`   Found ${relatedProducts.length} related products:`);
      
      if (relatedProducts.length === 0) {
        console.log('   ❌ No related products found');
        continue;
      }
      
      // Group by match type
      const exactMatches = relatedProducts.filter(p => p.totalScore === 30);
      const subCategoryMatches = relatedProducts.filter(p => p.totalScore === 20);
      const categoryMatches = relatedProducts.filter(p => p.totalScore === 10);
      const noMatches = relatedProducts.filter(p => p.totalScore === 0);
      
      console.log(`   📊 Exact matches (same category + subcategory): ${exactMatches.length}`);
      console.log(`   📊 SubCategory matches: ${subCategoryMatches.length}`);
      console.log(`   📊 Category matches: ${categoryMatches.length}`);
      console.log(`   📊 No category matches: ${noMatches.length}`);
      
      // Show top 3 matches
      console.log('   🎯 Top matches:');
      relatedProducts.slice(0, 3).forEach((product, index) => {
        const matchType = product.totalScore === 30 ? 'Exact' :
                         product.totalScore === 20 ? 'SubCategory' :
                         product.totalScore === 10 ? 'Category' : 'None';
        
        console.log(`     ${index + 1}. ${product.title} (${matchType} - Score: ${product.totalScore})`);
        console.log(`        ${product.category} > ${product.subCategory}`);
        console.log(`        Price: UGX ${product.salePrice.toLocaleString()}, Stock: ${product.stock}`);
      });
    }
    
    console.log('\n✅ Related products API test complete!');
    
  } catch (error) {
    console.error('❌ Error testing related products API:', error);
  }
};

// Test API response format
const testAPIResponseFormat = async () => {
  try {
    console.log('\n📋 TESTING API RESPONSE FORMAT...\n');
    
    // Get a sample product
    const sampleProduct = await Product.findOne({ status: 'active' });
    
    if (!sampleProduct) {
      console.log('❌ No active products found');
      return;
    }
    
    console.log(`📱 Testing API response format for: ${sampleProduct.title}`);
    
    // Get related products
    const pipeline = [
      { $match: { 
        _id: { $ne: sampleProduct._id },
        status: 'active',
        stock: { $gt: 0 }
      }},
      { $addFields: {
        totalScore: {
          $add: [
            { $cond: [{ $eq: ['$category', sampleProduct.category] }, 10, 0] },
            { $cond: [{ $eq: ['$subCategory', sampleProduct.subCategory] }, 20, 0] }
          ]
        }
      }},
      { $sort: { totalScore: -1, createdAt: -1 } },
      { $limit: 6 },
      { $project: {
        title: 1,
        salePrice: 1,
        regularPrice: 1,
        images: 1,
        category: 1,
        subCategory: 1,
        stock: 1,
        brand: 1,
        totalScore: 1
      }}
    ];
    
    const relatedProducts = await Product.aggregate(pipeline);
    
    // Transform to API response format
    const transformedProducts = relatedProducts.map(product => ({
      id: product._id.toString(),
      name: product.title,
      price: product.salePrice,
      originalPrice: product.regularPrice,
      image: product.images && product.images.length > 0 ? 
        (product.images[0].url || product.images[0].uri || '') : '',
      images: product.images || [],
      category: product.category,
      subCategory: product.subCategory,
      stock: product.stock,
      brand: product.brand,
      rating: 4.0 + Math.random() * 1, // Mock rating
      reviews: Math.floor(Math.random() * 200) + 10, // Mock reviews
      matchScore: product.totalScore
    }));
    
    // Simulate API response
    const apiResponse = {
      success: true,
      products: transformedProducts,
      count: transformedProducts.length,
      currentProduct: {
        id: sampleProduct._id,
        category: sampleProduct.category,
        subCategory: sampleProduct.subCategory
      }
    };
    
    console.log('📤 API Response Format:');
    console.log(JSON.stringify(apiResponse, null, 2));
    
    console.log('\n✅ API response format test complete!');
    
  } catch (error) {
    console.error('❌ Error testing API response format:', error);
  }
};

// Main execution
const main = async () => {
  await connectDB();
  await testRelatedProductsAPI();
  await testAPIResponseFormat();
  
  console.log('\n🏁 All tests complete! Closing database connection...');
  await mongoose.connection.close();
  process.exit(0);
};

// Handle errors
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Promise Rejection:', err);
  process.exit(1);
});

// Run the script
main();