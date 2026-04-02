const mongoose = require('mongoose');
const Product = require('./models/Product');
require('dotenv').config();

async function debugCartIssue() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/your-db-name');
    console.log('Connected to MongoDB');

    // Get a sample product to test with
    const sampleProduct = await Product.findOne({ category: 'Electronics' });
    
    if (!sampleProduct) {
      console.log('No Electronics products found');
      return;
    }

    console.log('\n=== SAMPLE PRODUCT FOR TESTING ===');
    console.log(`ID: ${sampleProduct._id}`);
    console.log(`Title: ${sampleProduct.title}`);
    console.log(`Stock: ${sampleProduct.stock}`);
    console.log(`Price: ${sampleProduct.salePrice}`);
    console.log(`Category: ${sampleProduct.category}`);

    // Simulate the frontend transformation
    const transformedProduct = {
      id: sampleProduct._id,
      name: sampleProduct.title,
      price: sampleProduct.salePrice,
      originalPrice: sampleProduct.regularPrice > sampleProduct.salePrice ? sampleProduct.regularPrice : null,
      image: sampleProduct.images?.[0]?.url || 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=400',
      rating: 4.5 + Math.random() * 0.5,
      reviews: Math.floor(Math.random() * 200) + 50,
      discount: sampleProduct.regularPrice > sampleProduct.salePrice ? 
        `${Math.round((1 - sampleProduct.salePrice / sampleProduct.regularPrice) * 100)}% OFF` : null,
      category: sampleProduct.category,
      subCategory: sampleProduct.subCategory,
      stock: sampleProduct.stock,
      description: sampleProduct.description,
      isNew: new Date(sampleProduct.createdAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      isTrending: Math.random() > 0.5,
      createdAt: sampleProduct.createdAt
    };

    console.log('\n=== TRANSFORMED PRODUCT (as frontend sees it) ===');
    console.log(JSON.stringify(transformedProduct, null, 2));

    // Test the disabled logic
    const mockCartQuantity = 1; // Simulate having 1 item in cart
    
    console.log('\n=== BUTTON STATE SIMULATION ===');
    console.log(`Mock cart quantity: ${mockCartQuantity}`);
    console.log(`Product stock: ${transformedProduct.stock}`);
    
    // Test the old logic (problematic)
    const oldDisabled = transformedProduct.stock && mockCartQuantity >= transformedProduct.stock;
    console.log(`Old logic disabled: ${oldDisabled}`);
    
    // Test the new logic (fixed)
    const newDisabled = transformedProduct.stock > 0 && mockCartQuantity >= transformedProduct.stock;
    console.log(`New logic disabled: ${newDisabled}`);
    
    // Test button color
    const oldColor = (transformedProduct.stock && mockCartQuantity >= transformedProduct.stock) ? "#95a5a6" : "white";
    const newColor = (transformedProduct.stock > 0 && mockCartQuantity >= transformedProduct.stock) ? "#95a5a6" : "white";
    
    console.log(`Old button color: ${oldColor}`);
    console.log(`New button color: ${newColor}`);

    console.log('\n=== DIAGNOSIS ===');
    if (transformedProduct.stock > 0) {
      console.log('✅ Product has valid stock');
      if (newDisabled) {
        console.log('⚠️  Button would be disabled because cart quantity >= stock');
      } else {
        console.log('✅ Button should be enabled and blue');
      }
    } else {
      console.log('❌ Product has zero/invalid stock - this would cause issues');
    }

  } catch (error) {
    console.error('Error in debug:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Run the debug
debugCartIssue();