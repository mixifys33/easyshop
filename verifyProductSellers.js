const mongoose = require('mongoose');
const Product = require('./models/Product');
const Seller = require('./models/Seller');
require('dotenv').config();

const verifyProductSellers = async () => {
  try {
    console.log('ðŸ” Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/global-investments');
    console.log('âœ… Connected to MongoDB\n');

    // Get all products
    console.log('ðŸ“¦ Fetching all products...');
    const products = await Product.find().populate('sellerId');
    console.log(`Found ${products.length} products\n`);

    // Check each product
    console.log('ðŸ” Verifying product seller information:\n');
    console.log('='.repeat(80));
    
    let productsWithSeller = 0;
    let productsWithoutSeller = 0;
    let productsWithInvalidSeller = 0;

    for (const product of products) {
      console.log(`\nProduct: ${product.title}`);
      console.log(`  ID: ${product._id}`);
      console.log(`  Seller ID: ${product.sellerId?._id || 'MISSING'}`);
      
      if (!product.sellerId) {
        console.log(`  âŒ NO SELLER ASSIGNED`);
        productsWithoutSeller++;
      } else if (typeof product.sellerId === 'object' && product.sellerId.shopName) {
        console.log(`  âœ… Shop Name: ${product.sellerId.shopName}`);
        console.log(`  ðŸ“§ Email: ${product.sellerId.email}`);
        console.log(`  âœ“ Verified: ${product.sellerId.verified ? 'Yes' : 'No'}`);
        productsWithSeller++;
      } else {
        console.log(`  âš ï¸ SELLER ID EXISTS BUT NOT POPULATED`);
        console.log(`  Seller ID Value: ${product.sellerId}`);
        productsWithInvalidSeller++;
      }
      console.log('-'.repeat(80));
    }

    console.log('\n' + '='.repeat(80));
    console.log('ðŸ“Š SUMMARY:');
    console.log(`  Total Products: ${products.length}`);
    console.log(`  âœ… Products with valid seller: ${productsWithSeller}`);
    console.log(`  âŒ Products without seller: ${productsWithoutSeller}`);
    console.log(`  âš ï¸ Products with invalid seller: ${productsWithInvalidSeller}`);
    console.log('='.repeat(80));

    // Get all sellers
    console.log('\nðŸ“Š Checking all sellers in database:\n');
    const sellers = await Seller.find();
    console.log(`Found ${sellers.length} sellers:\n`);
    
    sellers.forEach((seller, index) => {
      console.log(`${index + 1}. ${seller.shopName}`);
      console.log(`   ID: ${seller._id}`);
      console.log(`   Email: ${seller.email}`);
      console.log(`   Verified: ${seller.verified ? 'Yes' : 'No'}`);
      console.log('');
    });

    // Check if there are products without sellers
    if (productsWithoutSeller > 0 || productsWithInvalidSeller > 0) {
      console.log('\nâš ï¸ WARNING: Some products have missing or invalid seller information!');
      console.log('This will cause "undefined" to show in the frontend.\n');
      
      if (sellers.length > 0) {
        console.log('ðŸ’¡ SUGGESTION: You can fix this by assigning a seller to these products.');
        console.log(`   Available Seller IDs: ${sellers.map(s => s._id).join(', ')}`);
      } else {
        console.log('âŒ ERROR: No sellers found in database!');
        console.log('   You need to create a seller first before creating products.');
      }
    } else {
      console.log('\nâœ… All products have valid seller information!');
    }

  } catch (error) {
    console.error('âŒ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nðŸ”Œ Disconnected from MongoDB');
  }
};

// Run the verification
verifyProductSellers();

