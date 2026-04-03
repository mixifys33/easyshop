/**
 * Test script: verifies that POST /api/orders creates an order in the DB
 * Run with: node test-order-creation.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const BASE_URL = `http://localhost:${process.env.PORT || 3000}/api`;

const testOrder = {
  userId: 'test-user-123',
  sellerId: 'test-seller-456',
  items: [
    { productId: 'prod-001', name: 'Test Product', price: 15000, quantity: 2, image: '' },
  ],
  delivery: { type: 'terminal', name: 'Kampala Terminal', fee: 5000, estimatedDays: '2-3' },
  paymentMethod: 'cod',
  paymentStatus: 'pending',
  subtotal: 30000,
  deliveryFee: 5000,
  customerInfo: { fullName: 'Test User', phone: '0771234567', address: '', city: 'Kampala', notes: '' },
  buyerInfo: { userId: 'test-user-123', name: 'Test User', email: 'test@example.com', phone: '0771234567' },
};

async function run() {
  console.log('=== Order Creation Test ===\n');

  // 1. POST order
  console.log('1. Posting order to', `${BASE_URL}/orders`);
  let orderId;
  try {
    const res = await fetch(`${BASE_URL}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testOrder),
    });
    const data = await res.json();
    console.log('   Status:', res.status);
    console.log('   Response:', JSON.stringify(data));
    if (!res.ok || !data.orderId) {
      console.error('FAIL: Order was not created. Response:', data);
      process.exit(1);
    }
    orderId = data.orderId;
    console.log('   PASS: Order created with ID:', orderId);
  } catch (e) {
    console.error('FAIL: Could not reach server:', e.message);
    console.error('Make sure the backend is running: cd backend && node server.js');
    process.exit(1);
  }

  // 2. GET order back
  console.log('\n2. Fetching order by userId...');
  try {
    const res = await fetch(`${BASE_URL}/orders?userId=test-user-123`);
    const data = await res.json();
    console.log('   Status:', res.status);
    const found = (data.orders || []).find(o => o._id === orderId);
    if (found) {
      console.log('   PASS: Order found in DB:', found._id);
      console.log('   Items:', found.items.length, '| Method:', found.paymentMethod, '| Status:', found.status);
    } else {
      console.error('   FAIL: Order not found in GET response. Orders returned:', data.orders?.length);
      process.exit(1);
    }
  } catch (e) {
    console.error('FAIL: GET orders error:', e.message);
    process.exit(1);
  }

  // 3. Cleanup — delete the test order directly via mongoose
  console.log('\n3. Cleaning up test order...');
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const CustomerOrder = mongoose.models.CustomerOrder
      || mongoose.model('CustomerOrder', new mongoose.Schema({}, { strict: false }));
    await CustomerOrder.findByIdAndDelete(orderId);
    await mongoose.disconnect();
    console.log('   PASS: Test order deleted');
  } catch (e) {
    console.warn('   WARN: Could not clean up test order:', e.message);
  }

  console.log('\n=== All tests passed ===');
}

run();
