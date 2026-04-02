const mongoose = require('mongoose');
const Product = require('./models/Product');
require('dotenv').config();

async function checkStock() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/your-db-name');
    console.log('Connected to MongoDB');

    // Get all products
    const products = await Product.find({});
    console.log(`\n=== STOCK ANALYSIS FOR ${products.length} PRODUCTS ===\n`);

    // Analyze stock values
    let zeroStock = 0;
    let undefinedStock = 0;
    let validStock = 0;
    let stockDistribution = {};

    products.forEach(product => {
      const stock = product.stock;
      
      if (stock === undefined || stock === null) {
        undefinedStock++;
        console.log(`❌ UNDEFINED STOCK: ${product.title} (ID: ${product._id})`);
      } else if (stock === 0) {
        zeroStock++;
        console.log(`⚠️  ZERO STOCK: ${product.title} (ID: ${product._id})`);
      } else if (stock > 0) {
        validStock++;
        // Group by stock ranges
        if (stock <= 10) stockDistribution['1-10'] = (stockDistribution['1-10'] || 0) + 1;
        else if (stock <= 50) stockDistribution['11-50'] = (stockDistribution['11-50'] || 0) + 1;
        else if (stock <= 100) stockDistribution['51-100'] = (stockDistribution['51-100'] || 0) + 1;
        else stockDistribution['100+'] = (stockDistribution['100+'] || 0) + 1;
        
        console.log(`✅ VALID STOCK: ${product.title} - Stock: ${stock}`);
      } else {
        console.log(`🚨 NEGATIVE STOCK: ${product.title} - Stock: ${stock} (ID: ${product._id})`);
      }
    });

    // Summary
    console.log(`\n=== SUMMARY ===`);
    console.log(`Total Products: ${products.length}`);
    console.log(`Products with Valid Stock (>0): ${validStock}`);
    console.log(`Products with Zero Stock: ${zeroStock}`);
    console.log(`Products with Undefined Stock: ${undefinedStock}`);
    
    if (Object.keys(stockDistribution).length > 0) {
      console.log(`\nStock Distribution:`);
      Object.entries(stockDistribution).forEach(([range, count]) => {
        console.log(`  ${range}: ${count} products`);
      });
    }

    // Recommendations
    console.log(`\n=== RECOMMENDATIONS ===`);
    if (zeroStock > 0) {
      console.log(`⚠️  ${zeroStock} products have zero stock - this will disable the + button`);
      console.log(`   Consider updating these products with appropriate stock levels`);
    }
    if (undefinedStock > 0) {
      console.log(`❌ ${undefinedStock} products have undefined stock - this may cause UI issues`);
      console.log(`   These should be updated with default stock values`);
    }
    if (validStock === 0) {
      console.log(`🚨 NO PRODUCTS have valid stock! This explains why + buttons are disabled`);
    }

    // Show sample products by category
    console.log(`\n=== PRODUCTS BY CATEGORY ===`);
    const categories = [...new Set(products.map(p => p.category))];
    for (const category of categories) {
      const categoryProducts = products.filter(p => p.category === category);
      const avgStock = categoryProducts.reduce((sum, p) => sum + (p.stock || 0), 0) / categoryProducts.length;
      console.log(`${category}: ${categoryProducts.length} products, Avg Stock: ${avgStock.toFixed(1)}`);
    }

  } catch (error) {
    console.error('Error checking stock:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Run the check
checkStock();