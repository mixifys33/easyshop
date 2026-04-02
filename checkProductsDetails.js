const mongoose = require('mongoose');
const Product = require('./models/Product');
const Seller = require('./models/Seller');

// Load environment variables
require('dotenv').config();

// Database connection
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://easyshop:HackerX123456@cluster0.pv3uslj.mongodb.net/easyshop?retryWrites=true&w=majority&appName=Cluster0&ssl=true&tlsAllowInvalidCertificates=true';
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

// Check products and their details
const checkProductsDetails = async () => {
  try {
    console.log('\n🔍 CHECKING PRODUCTS DATABASE...\n');
    
    // Get total product count
    const totalProducts = await Product.countDocuments();
    console.log(`📊 Total Products: ${totalProducts}`);
    
    if (totalProducts === 0) {
      console.log('❌ No products found in database');
      return;
    }
    
    // Get products by status
    const activeProducts = await Product.countDocuments({ status: 'active' });
    const inactiveProducts = await Product.countDocuments({ status: 'inactive' });
    const draftProducts = await Product.countDocuments({ status: 'draft' });
    
    console.log(`📈 Active Products: ${activeProducts}`);
    console.log(`📉 Inactive Products: ${inactiveProducts}`);
    console.log(`📝 Draft Products: ${draftProducts}`);
    
    // Get products by category
    console.log('\n📂 PRODUCTS BY CATEGORY:');
    const categoryStats = await Product.aggregate([
      { $match: { status: 'active' } },
      { $group: { 
        _id: '$category', 
        count: { $sum: 1 },
        avgPrice: { $avg: '$salePrice' },
        totalStock: { $sum: '$stock' }
      }},
      { $sort: { count: -1 } }
    ]);
    
    categoryStats.forEach(cat => {
      console.log(`  ${cat._id}: ${cat.count} products, Avg Price: UGX ${Math.round(cat.avgPrice).toLocaleString()}, Total Stock: ${cat.totalStock}`);
    });
    
    // Get products by subcategory
    console.log('\n📁 PRODUCTS BY SUBCATEGORY:');
    const subCategoryStats = await Product.aggregate([
      { $match: { status: 'active' } },
      { $group: { 
        _id: { category: '$category', subCategory: '$subCategory' }, 
        count: { $sum: 1 },
        avgPrice: { $avg: '$salePrice' }
      }},
      { $sort: { '_id.category': 1, count: -1 } }
    ]);
    
    subCategoryStats.forEach(subCat => {
      console.log(`  ${subCat._id.category} > ${subCat._id.subCategory}: ${subCat.count} products, Avg Price: UGX ${Math.round(subCat.avgPrice).toLocaleString()}`);
    });
    
    // Check products with images
    const productsWithImages = await Product.countDocuments({ 
      status: 'active',
      'images.0': { $exists: true }
    });
    const productsWithoutImages = activeProducts - productsWithImages;
    
    console.log(`\n🖼️  PRODUCT IMAGES:`);
    console.log(`  Products with images: ${productsWithImages}`);
    console.log(`  Products without images: ${productsWithoutImages}`);
    
    // Check stock levels
    const outOfStock = await Product.countDocuments({ status: 'active', stock: 0 });
    const lowStock = await Product.countDocuments({ status: 'active', stock: { $gt: 0, $lte: 10 } });
    const inStock = await Product.countDocuments({ status: 'active', stock: { $gt: 10 } });
    
    console.log(`\n📦 STOCK LEVELS:`);
    console.log(`  Out of stock: ${outOfStock}`);
    console.log(`  Low stock (1-10): ${lowStock}`);
    console.log(`  In stock (>10): ${inStock}`);
    
    // Price analysis
    const priceStats = await Product.aggregate([
      { $match: { status: 'active' } },
      { $group: {
        _id: null,
        avgPrice: { $avg: '$salePrice' },
        minPrice: { $min: '$salePrice' },
        maxPrice: { $max: '$salePrice' },
        totalValue: { $sum: { $multiply: ['$salePrice', '$stock'] } }
      }}
    ]);
    
    if (priceStats.length > 0) {
      const stats = priceStats[0];
      console.log(`\n💰 PRICE ANALYSIS:`);
      console.log(`  Average Price: UGX ${Math.round(stats.avgPrice).toLocaleString()}`);
      console.log(`  Lowest Price: UGX ${Math.round(stats.minPrice).toLocaleString()}`);
      console.log(`  Highest Price: UGX ${Math.round(stats.maxPrice).toLocaleString()}`);
      console.log(`  Total Inventory Value: UGX ${Math.round(stats.totalValue).toLocaleString()}`);
    }
    
    // Recent products
    console.log(`\n🆕 RECENT PRODUCTS (Last 10):`);
    const recentProducts = await Product.find({ status: 'active' })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('sellerId', 'shopName')
      .select('title category subCategory salePrice stock createdAt sellerId');
    
    recentProducts.forEach((product, index) => {
      const seller = product.sellerId ? product.sellerId.shopName : 'Unknown Seller';
      console.log(`  ${index + 1}. ${product.title}`);
      console.log(`     Category: ${product.category} > ${product.subCategory}`);
      console.log(`     Price: UGX ${product.salePrice.toLocaleString()}, Stock: ${product.stock}`);
      console.log(`     Seller: ${seller}`);
      console.log(`     Created: ${product.createdAt.toLocaleDateString()}`);
      console.log('');
    });
    
    // Products without proper data
    console.log(`\n⚠️  DATA QUALITY ISSUES:`);
    
    const noDescription = await Product.countDocuments({ 
      status: 'active',
      $or: [
        { description: '' },
        { description: { $exists: false } }
      ]
    });
    
    const noCategory = await Product.countDocuments({ 
      status: 'active',
      $or: [
        { category: '' },
        { category: { $exists: false } }
      ]
    });
    
    const noSubCategory = await Product.countDocuments({ 
      status: 'active',
      $or: [
        { subCategory: '' },
        { subCategory: { $exists: false } }
      ]
    });
    
    const invalidPrices = await Product.countDocuments({ 
      status: 'active',
      $or: [
        { salePrice: { $lte: 0 } },
        { regularPrice: { $lte: 0 } }
      ]
    });
    
    console.log(`  Products without description: ${noDescription}`);
    console.log(`  Products without category: ${noCategory}`);
    console.log(`  Products without subcategory: ${noSubCategory}`);
    console.log(`  Products with invalid prices: ${invalidPrices}`);
    
    // Seller analysis
    console.log(`\n👥 SELLER ANALYSIS:`);
    const sellerStats = await Product.aggregate([
      { $match: { status: 'active' } },
      { $group: {
        _id: '$sellerId',
        productCount: { $sum: 1 },
        totalStock: { $sum: '$stock' },
        avgPrice: { $avg: '$salePrice' }
      }},
      { $lookup: {
        from: 'sellers',
        localField: '_id',
        foreignField: '_id',
        as: 'seller'
      }},
      { $sort: { productCount: -1 } },
      { $limit: 10 }
    ]);
    
    console.log('  Top 10 Sellers by Product Count:');
    sellerStats.forEach((seller, index) => {
      const sellerName = seller.seller && seller.seller.length > 0 ? 
        seller.seller[0].shopName || seller.seller[0].name : 'Unknown Seller';
      console.log(`    ${index + 1}. ${sellerName}: ${seller.productCount} products, Avg Price: UGX ${Math.round(seller.avgPrice).toLocaleString()}`);
    });
    
    console.log('\n✅ Product analysis complete!');
    
  } catch (error) {
    console.error('❌ Error checking products:', error);
  }
};

// Test related products functionality
const testRelatedProducts = async () => {
  try {
    console.log('\n🔗 TESTING RELATED PRODUCTS FUNCTIONALITY...\n');
    
    // Get a sample product
    const sampleProduct = await Product.findOne({ status: 'active' });
    
    if (!sampleProduct) {
      console.log('❌ No active products found for testing');
      return;
    }
    
    console.log(`📱 Testing with product: ${sampleProduct.title}`);
    console.log(`   Category: ${sampleProduct.category}`);
    console.log(`   SubCategory: ${sampleProduct.subCategory}`);
    
    // Find related products using the same logic as the API
    const relatedProducts = await Product.aggregate([
      { $match: { 
        _id: { $ne: sampleProduct._id },
        status: 'active',
        stock: { $gt: 0 }
      }},
      { $addFields: {
        categoryScore: {
          $cond: [
            { $eq: ['$category', sampleProduct.category] }, 
            10,
            0
          ]
        },
        subCategoryScore: {
          $cond: [
            { $eq: ['$subCategory', sampleProduct.subCategory] }, 
            20,
            0
          ]
        },
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
        category: 1,
        subCategory: 1,
        salePrice: 1,
        totalScore: 1
      }}
    ]);
    
    console.log(`\n🎯 Found ${relatedProducts.length} related products:`);
    
    relatedProducts.forEach((product, index) => {
      const matchType = product.totalScore === 30 ? 'Exact Match (Same Category + SubCategory)' :
                       product.totalScore === 20 ? 'SubCategory Match' :
                       product.totalScore === 10 ? 'Category Match' : 'No Match';
      
      console.log(`  ${index + 1}. ${product.title}`);
      console.log(`     ${product.category} > ${product.subCategory}`);
      console.log(`     Price: UGX ${product.salePrice.toLocaleString()}`);
      console.log(`     Match: ${matchType} (Score: ${product.totalScore})`);
      console.log('');
    });
    
    // Count matches by type
    const exactMatches = relatedProducts.filter(p => p.totalScore === 30).length;
    const subCategoryMatches = relatedProducts.filter(p => p.totalScore === 20).length;
    const categoryMatches = relatedProducts.filter(p => p.totalScore === 10).length;
    const noMatches = relatedProducts.filter(p => p.totalScore === 0).length;
    
    console.log(`📊 Match Summary:`);
    console.log(`   Exact matches (same category + subcategory): ${exactMatches}`);
    console.log(`   SubCategory matches: ${subCategoryMatches}`);
    console.log(`   Category matches: ${categoryMatches}`);
    console.log(`   No category matches: ${noMatches}`);
    
  } catch (error) {
    console.error('❌ Error testing related products:', error);
  }
};

// Main execution
const main = async () => {
  await connectDB();
  await checkProductsDetails();
  await testRelatedProducts();
  
  console.log('\n🏁 Analysis complete! Closing database connection...');
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