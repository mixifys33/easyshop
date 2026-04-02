const mongoose = require('mongoose');
const Product = require('../models/Product');
const Seller = require('../models/Seller');
require('dotenv').config();

// Connect to database
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/easyshop');
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Check products statistics
const checkProducts = async () => {
  try {
    console.log('\n📊 PRODUCT STATISTICS\n');
    console.log('='.repeat(50));

    // Total products
    const totalProducts = await Product.countDocuments();
    console.log(`📦 Total Products: ${totalProducts}`);

    // Products by status
    const productsByStatus = await Product.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalValue: { $sum: '$salePrice' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    console.log('\n📈 Products by Status:');
    productsByStatus.forEach(status => {
      console.log(`  ${status._id}: ${status.count} products (Total Value: ${status.totalValue.toFixed(2)})`);
    });

    // Products by category
    const productsByCategory = await Product.aggregate([
      { $match: { status: 'active' } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    console.log('\n🏷️ Active Products by Category:');
    productsByCategory.forEach(category => {
      console.log(`  ${category._id}: ${category.count} products`);
    });

    // Products by seller
    const productsBySeller = await Product.aggregate([
      { $match: { status: 'active' } },
      {
        $group: {
          _id: '$sellerId',
          count: { $sum: 1 },
          totalValue: { $sum: '$salePrice' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    console.log('\n👥 Top 10 Sellers by Product Count:');
    for (const sellerStat of productsBySeller) {
      try {
        const seller = await Seller.findById(sellerStat._id);
        const sellerName = seller ? seller.shopName || seller.email : 'Unknown Seller';
        console.log(`  ${sellerName}: ${sellerStat.count} products (Total Value: ${sellerStat.totalValue.toFixed(2)})`);
      } catch (error) {
        console.log(`  Seller ID ${sellerStat._id}: ${sellerStat.count} products (Total Value: ${sellerStat.totalValue.toFixed(2)})`);
      }
    }

    // Recent products
    const recentProducts = await Product.find({ status: 'active' })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('sellerId', 'shopName email');

    console.log('\n🆕 5 Most Recent Products:');
    recentProducts.forEach((product, index) => {
      const sellerName = product.sellerId ? (product.sellerId.shopName || product.sellerId.email) : 'Unknown Seller';
      console.log(`  ${index + 1}. "${product.title}" by ${sellerName} - ${product.currency} ${product.salePrice}`);
    });

    // Draft statistics
    const totalDrafts = await Product.countDocuments({ isDraft: true, status: 'draft' });
    const expiredDrafts = await Product.countDocuments({ 
      isDraft: true, 
      status: 'draft',
      draftExpiresAt: { $lte: new Date() }
    });

    console.log('\n📝 Draft Statistics:');
    console.log(`  Total Drafts: ${totalDrafts}`);
    console.log(`  Expired Drafts: ${expiredDrafts}`);
    console.log(`  Active Drafts: ${totalDrafts - expiredDrafts}`);

    // Price statistics
    const priceStats = await Product.aggregate([
      { $match: { status: 'active' } },
      {
        $group: {
          _id: null,
          avgPrice: { $avg: '$salePrice' },
          minPrice: { $min: '$salePrice' },
          maxPrice: { $max: '$salePrice' },
          totalValue: { $sum: '$salePrice' }
        }
      }
    ]);

    if (priceStats.length > 0) {
      const stats = priceStats[0];
      console.log('\n💰 Price Statistics (Active Products):');
      console.log(`  Average Price: ${stats.avgPrice.toFixed(2)}`);
      console.log(`  Minimum Price: ${stats.minPrice.toFixed(2)}`);
      console.log(`  Maximum Price: ${stats.maxPrice.toFixed(2)}`);
      console.log(`  Total Inventory Value: ${stats.totalValue.toFixed(2)}`);
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ Product statistics completed successfully!');

  } catch (error) {
    console.error('❌ Error checking products:', error);
  }
};

// Main function
const main = async () => {
  await connectDB();
  await checkProducts();
  
  // Close database connection
  await mongoose.connection.close();
  console.log('🔌 Database connection closed');
  process.exit(0);
};

// Run the script
main().catch(error => {
  console.error('❌ Script error:', error);
  process.exit(1);
});