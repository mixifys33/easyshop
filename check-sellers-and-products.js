const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Seller = require('./models/Seller');
const Product = require('./models/Product');

// Connect to MongoDB
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
}

// Check sellers and their products
async function checkSellersAndProducts() {
  try {
    console.log('\n🔍 CHECKING SELLERS AND PRODUCTS DATABASE\n');
    console.log('=' .repeat(60));

    // Get all sellers
    const sellers = await Seller.find({}).lean();
    console.log(`\n📊 TOTAL SELLERS: ${sellers.length}\n`);

    if (sellers.length === 0) {
      console.log('❌ No sellers found in database');
      return;
    }

    // Get all products
    const allProducts = await Product.find({}).lean();
    console.log(`📦 TOTAL PRODUCTS: ${allProducts.length}\n`);

    // Detailed seller information
    console.log('👥 SELLER DETAILS:');
    console.log('-' .repeat(60));

    for (let i = 0; i < sellers.length; i++) {
      const seller = sellers[i];
      
      // Get products for this seller
      const sellerProducts = await Product.find({ sellerId: seller._id }).lean();
      
      console.log(`\n${i + 1}. SELLER: ${seller.name}`);
      console.log(`   📧 Email: ${seller.email}`);
      console.log(`   📱 Phone: ${seller.phoneNumber || 'Not provided'}`);
      console.log(`   ✅ Verified: ${seller.verified ? 'Yes' : 'No'}`);
      console.log(`   🏪 Status: ${seller.status || 'Unknown'}`);
      console.log(`   🏬 Shop Setup: ${seller.shop?.isSetup ? 'Yes' : 'No'}`);
      
      if (seller.shop?.isSetup) {
        console.log(`   🏪 Shop Name: ${seller.shop.shopName || 'Not set'}`);
        console.log(`   🏢 Business Type: ${seller.shop.businessType || 'Not set'}`);
        console.log(`   🌍 City: ${seller.shop.city || 'Not set'}`);
      }
      
      console.log(`   📦 Products: ${sellerProducts.length}`);
      
      if (sellerProducts.length > 0) {
        console.log(`   📋 Product Categories:`);
        const categories = [...new Set(sellerProducts.map(p => p.category).filter(c => c))];
        categories.forEach(cat => {
          const count = sellerProducts.filter(p => p.category === cat).length;
          console.log(`      - ${cat}: ${count} products`);
        });
        
        // Show recent products
        const recentProducts = sellerProducts
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, 3);
        
        console.log(`   🆕 Recent Products:`);
        recentProducts.forEach((product, idx) => {
          console.log(`      ${idx + 1}. ${product.title} - ${product.currency || 'UGX'} ${product.salePrice || 0}`);
        });
      }
      
      console.log(`   📅 Joined: ${new Date(seller.createdAt).toLocaleDateString()}`);
    }

    // Products without sellers (orphaned products)
    const orphanedProducts = await Product.find({ 
      $or: [
        { sellerId: null },
        { sellerId: { $exists: false } }
      ]
    }).lean();

    if (orphanedProducts.length > 0) {
      console.log(`\n⚠️  ORPHANED PRODUCTS (No Seller): ${orphanedProducts.length}`);
      console.log('-' .repeat(60));
      orphanedProducts.slice(0, 5).forEach((product, idx) => {
        console.log(`${idx + 1}. ${product.title} - Created: ${new Date(product.createdAt).toLocaleDateString()}`);
      });
      if (orphanedProducts.length > 5) {
        console.log(`   ... and ${orphanedProducts.length - 5} more orphaned products`);
      }
    }

    // Summary statistics
    console.log('\n📈 SUMMARY STATISTICS:');
    console.log('-' .repeat(60));
    console.log(`👥 Total Sellers: ${sellers.length}`);
    console.log(`✅ Verified Sellers: ${sellers.filter(s => s.verified).length}`);
    console.log(`🏪 Sellers with Shop Setup: ${sellers.filter(s => s.shop?.isSetup).length}`);
    console.log(`📦 Total Products: ${allProducts.length}`);
    console.log(`⚠️  Orphaned Products: ${orphanedProducts.length}`);
    
    // Products by status
    const activeProducts = allProducts.filter(p => p.status === 'active').length;
    const draftProducts = allProducts.filter(p => p.status === 'draft').length;
    const inactiveProducts = allProducts.filter(p => p.status === 'inactive').length;
    
    console.log(`🟢 Active Products: ${activeProducts}`);
    console.log(`📝 Draft Products: ${draftProducts}`);
    console.log(`🔴 Inactive Products: ${inactiveProducts}`);

    // Top categories
    const allCategories = allProducts.map(p => p.category).filter(c => c);
    const categoryCount = {};
    allCategories.forEach(cat => {
      categoryCount[cat] = (categoryCount[cat] || 0) + 1;
    });
    
    const topCategories = Object.entries(categoryCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5);
    
    if (topCategories.length > 0) {
      console.log(`\n🏷️  TOP CATEGORIES:`);
      topCategories.forEach(([category, count], idx) => {
        console.log(`${idx + 1}. ${category}: ${count} products`);
      });
    }

    // Recent activity
    const recentProducts = allProducts
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);
    
    if (recentProducts.length > 0) {
      console.log(`\n🆕 RECENT PRODUCTS:`);
      recentProducts.forEach((product, idx) => {
        const seller = sellers.find(s => s._id.toString() === product.sellerId?.toString());
        console.log(`${idx + 1}. ${product.title}`);
        console.log(`   Seller: ${seller?.name || 'Unknown'}`);
        console.log(`   Price: ${product.currency || 'UGX'} ${product.salePrice || 0}`);
        console.log(`   Created: ${new Date(product.createdAt).toLocaleDateString()}`);
      });
    }

    console.log('\n' + '=' .repeat(60));
    console.log('✅ Database check completed successfully!');

  } catch (error) {
    console.error('❌ Error checking database:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run the check
async function main() {
  await connectDB();
  await checkSellersAndProducts();
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\n🛑 Process interrupted, closing database connection...');
  await mongoose.connection.close();
  process.exit(0);
});

// Run the script
main().catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});