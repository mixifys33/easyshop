const mongoose = require('mongoose');
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

// Reset Product schema
const resetProductSchema = async () => {
  try {
    console.log('\n🔄 RESETTING PRODUCT SCHEMA\n');
    console.log('='.repeat(50));

    // Check if products collection exists
    const collections = await mongoose.connection.db.listCollections().toArray();
    const productCollection = collections.find(col => col.name === 'products');
    
    if (productCollection) {
      console.log('📦 Found existing products collection');
      
      // Get count of existing products
      const existingCount = await mongoose.connection.db.collection('products').countDocuments();
      console.log(`📊 Existing products: ${existingCount}`);
      
      if (existingCount > 0) {
        console.log('⚠️  WARNING: This will delete all existing products!');
        console.log('💾 Consider backing up your data first');
        
        // In a real scenario, you might want to migrate data instead of dropping
        // For now, we'll drop the collection to reset the schema
        await mongoose.connection.db.collection('products').drop();
        console.log('🗑️  Dropped existing products collection');
      } else {
        await mongoose.connection.db.collection('products').drop();
        console.log('🗑️  Dropped empty products collection');
      }
    } else {
      console.log('📦 No existing products collection found');
    }

    // Import the new Product model to create the collection with new schema
    const Product = require('../models/Product');
    
    // Create a test product to initialize the collection with new schema
    const testProduct = new Product({
      title: 'Test Product - Schema Reset',
      description: 'This is a test product created to initialize the new schema',
      category: 'Electronics',
      subCategory: 'Phones',
      regularPrice: 100000,
      salePrice: 90000,
      stock: 1,
      sellerId: new mongoose.Types.ObjectId(), // Dummy seller ID
      images: [{
        uri: 'test-image.jpg',
        width: 800,
        height: 600,
        fileSize: 50000
      }],
      status: 'draft' // Mark as draft so it doesn't appear in real products
    });

    await testProduct.save();
    console.log('✅ Created test product with new schema');
    
    // Remove the test product
    await Product.findByIdAndDelete(testProduct._id);
    console.log('🗑️  Removed test product');

    console.log('\n📋 New Product Schema Fields:');
    console.log('- title (required)');
    console.log('- description (required)');
    console.log('- category (required)');
    console.log('- subCategory (required)');
    console.log('- regularPrice (required)');
    console.log('- salePrice (required)');
    console.log('- stock (required)');
    console.log('- sellerId (required)');
    console.log('- images (array)');
    console.log('- colors, sizes, customSpecs (optional)');
    console.log('- status, isDraft, draftExpiresAt (system fields)');

    console.log('\n' + '='.repeat(50));
    console.log('✅ Product schema reset completed successfully!');
    console.log('🚀 You can now create products with the new schema');

  } catch (error) {
    console.error('❌ Error resetting product schema:', error);
  }
};

// Main function
const main = async () => {
  await connectDB();
  await resetProductSchema();
  
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