const express = require('express');
const cors = require('cors');
const connectDB = require('./config/database');
require('dotenv').config();

// Import routes
const productRoutes = require('./routes/products');
const authRoutes = require('./routes/auth');
const sellerRoutes = require('./routes/sellers');
const categoryRoutes = require('./routes/categories');
const draftRoutes = require('./routes/drafts');
const imagekitRoutes = require('./routes/imagekit');
const aiRoutes = require('./routes/ai');
const deliveryRoutes = require('./routes/delivery');
const orderRoutes = require('./routes/orders');
const paymentVerifyRoutes = require('./routes/paymentVerify');
const shopAIRoutes = require('./routes/shopAI');
const campaignRoutes = require('./routes/campaigns');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to database
connectDB();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Routes
app.use('/api/products/draft', draftRoutes);
app.use('/api/products', productRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/sellers', sellerRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/imagekit', imagekitRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payment-verify', paymentVerifyRoutes);
app.use('/api/shop-ai', shopAIRoutes);
app.use('/api/campaigns', campaignRoutes);

app.get('/api/health', (req, res) => {
  res.json({ message: 'Backend server is running with database!' });
});

// Global error handler to ensure JSON responses
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  res.status(500).json({
    message: 'Internal server error',
    error: error.message || 'Something went wrong'
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    message: 'API endpoint not found',
    error: `Route ${req.method} ${req.originalUrl} not found`
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});