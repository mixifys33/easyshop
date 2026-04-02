const mongoose = require('mongoose');
const Product = require('./models/Product');
require('dotenv').config();

const sampleProducts = [
  {
    name: "Wireless Headphones",
    price: 99.99,
    description: "High-quality wireless headphones with noise cancellation",
    image: "https://via.placeholder.com/300x300",
    category: "Electronics",
    stock: 50,
    featured: true
  },
  {
    name: "Smartphone",
    price: 699.99,
    description: "Latest smartphone with advanced features",
    image: "https://via.placeholder.com/300x300",
    category: "Electronics",
    stock: 30,
    featured: true
  },
  {
    name: "Laptop",
    price: 1299.99,
    description: "Powerful laptop for work and gaming",
    image: "https://via.placeholder.com/300x300",
    category: "Electronics",
    stock: 20,
    featured: false
  },
  {
    name: "Running Shoes",
    price: 129.99,
    description: "Comfortable running shoes for daily exercise",
    image: "https://via.placeholder.com/300x300",
    category: "Sports",
    stock: 100,
    featured: false
  },
  {
    name: "Coffee Maker",
    price: 89.99,
    description: "Automatic coffee maker with programmable timer",
    image: "https://via.placeholder.com/300x300",
    category: "Home",
    stock: 25,
    featured: false
  }
];

const seedDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing products
    await Product.deleteMany({});
    console.log('Cleared existing products');

    // Insert sample products
    await Product.insertMany(sampleProducts);
    console.log('Sample products inserted successfully');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
};

seedDatabase();