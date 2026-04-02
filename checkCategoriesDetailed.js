const mongoose = require('mongoose');
const Product = require('./models/Product');
const Seller = require('./models/Seller');
require('dotenv').config();

const checkCategoriesDetailed = async () => {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('🔗 Connected to MongoDB');
    console.log('='.repeat(60));
    
    // Get total counts
    const totalProducts = await Product.countDocuments();
    const totalSellers = await Seller.countDocuments();
    
    console.log(`📊 Database Overview:`);
    console.log(`   Total Products: ${totalProducts}`);
    console.log(`   Total Sellers: ${totalSellers}`);
    console.log('='.repeat(60));
    
    if (totalProducts === 0) {
      console.log('❌ No products found in the database');
      return;
    }
    
    // Get detailed category analysis
    const categoryAnalysis = await Product.aggregate([
      {
        $group: {
          _id: {
            category: '$category',
            subCategory: '$subCategory'
          },
          count: { $sum: 1 },
          avgPrice: { $avg: '$salePrice' },
          minPrice: { $min: '$salePrice' },
          maxPrice: { $max: '$salePrice' },
          totalStock: { $sum: '$stock' },
          sellers: { $addToSet: '$sellerId' }
        }
      },
      {
        $sort: {
          '_id.category': 1,
          '_id.subCategory': 1
        }
      }
    ]);
    
    console.log('📋 Detailed Category Analysis:');
    console.log('='.repeat(60));
    
    let currentCategory = '';
    let categoryTotals = {};
    
    for (const item of categoryAnalysis) {
      const { category, subCategory } = item._id;
      
      // Initialize category totals if new category
      if (!categoryTotals[category]) {
        categoryTotals[category] = {
          products: 0,
          sellers: new Set(),
          totalStock: 0,
          minPrice: Infinity,
          maxPrice: 0
        };
      }
      
      // Update category totals
      categoryTotals[category].products += item.count;
      item.sellers.forEach(seller => categoryTotals[category].sellers.add(seller.toString()));
      categoryTotals[category].totalStock += item.totalStock;
      categoryTotals[category].minPrice = Math.min(categoryTotals[category].minPrice, item.minPrice);
      categoryTotals[category].maxPrice = Math.max(categoryTotals[category].maxPrice, item.maxPrice);
      
      // Print category header if new
      if (currentCategory !== category) {
        if (currentCategory !== '') console.log(); // Add spacing between categories
        console.log(`🏷️  ${category.toUpperCase()}`);
        console.log('-'.repeat(40));
        currentCategory = category;
      }
      
      console.log(`   📁 ${subCategory}:`);
      console.log(`      Products: ${item.count}`);
      console.log(`      Avg Price: UGX ${item.avgPrice.toLocaleString()}`);
      console.log(`      Price Range: UGX ${item.minPrice.toLocaleString()} - UGX ${item.maxPrice.toLocaleString()}`);
      console.log(`      Total Stock: ${item.totalStock}`);
      console.log(`      Unique Sellers: ${item.sellers.length}`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 Category Summary:');
    console.log('='.repeat(60));
    
    for (const [category, totals] of Object.entries(categoryTotals)) {
      console.log(`🏷️  ${category}:`);
      console.log(`   Total Products: ${totals.products}`);
      console.log(`   Unique Sellers: ${totals.sellers.size}`);
      console.log(`   Total Stock: ${totals.totalStock}`);
      console.log(`   Price Range: UGX ${totals.minPrice.toLocaleString()} - UGX ${totals.maxPrice.toLocaleString()}`);
      console.log();
    }
    
    // Get top categories by product count
    const topCategories = Object.entries(categoryTotals)
      .sort((a, b) => b[1].products - a[1].products)
      .slice(0, 5);
    
    console.log('🏆 Top 5 Categories by Product Count:');
    console.log('-'.repeat(40));
    topCategories.forEach(([category, data], index) => {
      console.log(`   ${index + 1}. ${category}: ${data.products} products`);
    });
    
    console.log('\n✅ Detailed category analysis completed!');
    
  } catch (error) {
    console.error('❌ Error in detailed category check:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
};

// Run the script
checkCategoriesDetailed();