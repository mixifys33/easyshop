/**
 * Fix existing orders by setting userId from buyerInfo.email
 * Run: node fix-order-userids.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  userId: { type: String },
  items: [{
    productId: String,
    name: String,
    price: Number,
    quantity: Number,
    image: String,
    currency: String,
  }],
  paymentStatus: { type: String, default: 'pending' },
  status: { type: String, default: 'pending' },
  subtotal: Number,
  customerInfo: {
    fullName: String,
    phone: String,
    email: String,
  },
  buyerInfo: {
    userId: String,
    name: String,
    email: String,
    phone: String,
  },
}, { timestamps: true });

const CustomerOrder = mongoose.model('CustomerOrder', orderSchema);

const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

async function fixOrderUserIds() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find all orders without userId
    const ordersWithoutUserId = await CustomerOrder.find({
      $or: [
        { userId: { $exists: false } },
        { userId: null },
        { userId: '' }
      ]
    });

    console.log(`📦 Found ${ordersWithoutUserId.length} orders without userId\n`);

    if (ordersWithoutUserId.length === 0) {
      console.log('✅ All orders already have userId set!');
      return;
    }

    let fixed = 0;
    let failed = 0;

    for (const order of ordersWithoutUserId) {
      const email = order.buyerInfo?.email || order.customerInfo?.email;
      
      if (!email) {
        console.log(`⚠️  Order ${order._id} has no email, skipping`);
        failed++;
        continue;
      }

      // Find user by email
      const user = await User.findOne({ email: email });
      
      if (!user) {
        console.log(`⚠️  No user found for email ${email}, skipping order ${order._id}`);
        failed++;
        continue;
      }

      // Update order with userId
      order.userId = user._id.toString();
      if (order.buyerInfo) {
        order.buyerInfo.userId = user._id.toString();
      }
      await order.save();

      console.log(`✅ Fixed order ${order._id} - set userId to ${user._id}`);
      fixed++;
    }

    console.log(`\n═══════════════════════════════════════`);
    console.log(`✅ Fixed: ${fixed} orders`);
    console.log(`⚠️  Failed: ${failed} orders`);
    console.log(`═══════════════════════════════════════\n`);

    // Verify the fix
    console.log('🔍 Verifying fix...');
    const stillBroken = await CustomerOrder.find({
      $or: [
        { userId: { $exists: false } },
        { userId: null },
        { userId: '' }
      ]
    });

    if (stillBroken.length === 0) {
      console.log('✅ All orders now have userId set!\n');
    } else {
      console.log(`⚠️  ${stillBroken.length} orders still without userId\n`);
    }

    // Show sample query result
    if (fixed > 0) {
      const sampleUser = await User.findOne({ email: ordersWithoutUserId[0].buyerInfo?.email || ordersWithoutUserId[0].customerInfo?.email });
      if (sampleUser) {
        const userOrders = await CustomerOrder.find({ userId: sampleUser._id.toString() });
        console.log(`📊 Sample query for user ${sampleUser.email}:`);
        console.log(`   GET /api/orders?userId=${sampleUser._id}`);
        console.log(`   Returns: ${userOrders.length} orders`);
        console.log(`   Paid orders: ${userOrders.filter(o => o.paymentStatus === 'paid').length}`);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

fixOrderUserIds();
