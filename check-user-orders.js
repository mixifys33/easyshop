/**
 * Check user orders to debug profile page issue
 * Run: node check-user-orders.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  userId: { type: String },
  orderRef: { type: String, index: true },
  sellerId: { type: String },
  items: [{
    productId: String,
    name: String,
    price: Number,
    quantity: Number,
    image: String,
    currency: String,
  }],
  paymentMethod: String,
  paymentStatus: { type: String, default: 'pending' },
  status: { type: String, default: 'pending' },
  subtotal: Number,
  deliveryFee: Number,
  customerInfo: {
    fullName: String,
    phone: String,
    address: String,
    city: String,
    notes: String,
  },
  buyerInfo: {
    userId: String,
    name: String,
    email: String,
    phone: String,
  },
}, { timestamps: true });

const CustomerOrder = mongoose.model('CustomerOrder', orderSchema);

async function checkUserOrders() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all orders
    const allOrders = await CustomerOrder.find().sort({ createdAt: -1 }).limit(10);
    
    console.log(`📦 Found ${allOrders.length} recent orders:\n`);
    
    allOrders.forEach((order, index) => {
      console.log(`${index + 1}. Order ID: ${order._id}`);
      console.log(`   User ID: ${order.userId || 'NOT SET'}`);
      console.log(`   Buyer Info User ID: ${order.buyerInfo?.userId || 'NOT SET'}`);
      console.log(`   Payment Status: ${order.paymentStatus}`);
      console.log(`   Status: ${order.status}`);
      console.log(`   Created: ${order.createdAt}`);
      console.log(`   Items: ${order.items?.length || 0}`);
      if (order.items?.length > 0) {
        order.items.forEach((item, i) => {
          console.log(`     ${i + 1}. ${item.name} - ProductID: ${item.productId || 'NOT SET'}`);
        });
      }
      console.log('');
    });

    // Check for paid orders
    const paidOrders = await CustomerOrder.find({ paymentStatus: 'paid' });
    console.log(`\n💰 Paid Orders: ${paidOrders.length}`);
    
    if (paidOrders.length > 0) {
      console.log('\nPaid orders details:');
      paidOrders.forEach((order) => {
        console.log(`  - Order ${order._id}`);
        console.log(`    User ID: ${order.userId || 'NOT SET'}`);
        console.log(`    Buyer Info User ID: ${order.buyerInfo?.userId || 'NOT SET'}`);
        console.log(`    Buyer Email: ${order.buyerInfo?.email || order.customerInfo?.email || 'NOT SET'}`);
        console.log(`    Total: ${order.subtotal || 0} ${order.items?.[0]?.currency || 'USD'}`);
        console.log('');
      });
      
      // Show what query the frontend would use
      const sampleUserId = paidOrders[0].userId || paidOrders[0].buyerInfo?.userId;
      if (sampleUserId) {
        console.log(`\n🔍 Frontend Query Test:`);
        console.log(`   GET /api/orders?userId=${sampleUserId}`);
        
        const userOrders = await CustomerOrder.find({ userId: sampleUserId });
        console.log(`   Would return: ${userOrders.length} orders`);
        
        if (userOrders.length === 0) {
          // Try with buyerInfo.userId
          const userOrdersByBuyerInfo = await CustomerOrder.find({ 'buyerInfo.userId': sampleUserId });
          console.log(`   Trying buyerInfo.userId: ${userOrdersByBuyerInfo.length} orders`);
        }
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

checkUserOrders();
