const mongoose = require('mongoose');
const Product = require('./models/Product');
require('dotenv').config();

const checkCategories = async () => {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Connected to MongoDB');
    console.log('='.repeat(50));
    
    // Get total product count
    const totalProducts = await Product.countDocuments();
    console.log(`📊 Total Products in Database: ${totalProducts}`);
    console.log('='.repeat(50));
    
    if (totalProducts === 0) {
      console.log('❌ No products found in the database');
      return;
    }
    
    // Get unique categories
    const categories = await Product.distinct('category');
    console.log(`📂 Unique Categories (${categories.length}):`);
    categories.forEach((category, index) => {
      console.log(`   ${index + 1}. ${category}`);
    });
    console.log();
    
    // Get unique subcategories
    const subCategories = await Product.distinct('subCategory');
    console.log(`📁 Unique Sub-Categories (${subCategories.length}):`);
    subCategories.forEach((subCategory, index) => {
      console.log(`   ${index + 1}. ${subCategory}`);
    });
    console.log();
    
    // Get category-subcategory combinations with product counts
    console.log('📋 Category → Sub-Category Breakdown:');
    console.log('-'.repeat(50));
    
    for (const category of categories) {
      const categoryProducts = await Product.countDocuments({ category });
      console.log(`\n🏷️  ${category} (${categoryProducts} products):`);
      
      const categorySubCategories = await Product.distinct('subCategory', { category });
      
      for (const subCategory of categorySubCategories) {
        const subCategoryCount = await Product.countDocuments({ 
          category, 
          subCategory 
        });
        console.log(`   └── ${subCategory} (${subCategoryCount} products)`);
      }
    }
    
    console.log('\n' + '='.repeat(50));
    
    // Get products by status
    const statusCounts = await Product.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    console.log('📈 Products by Status:');
    statusCounts.forEach(status => {
      console.log(`   ${status._id}: ${status.count} products`);
    });
    
    console.log('\n✅ Category check completed successfully!');
    
  } catch (error) {
    console.error('❌ Error checking categories:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
};

// Run the script
checkCategories();