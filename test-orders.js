const http = require('http');
const mongoose = require('mongoose');
require('dotenv').config();

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: 'localhost', port: 3000, path, method,
      headers: { 'Content-Type': 'application/json', ...(data && { 'Content-Length': Buffer.byteLength(data) }) }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log('=== ORDER API TESTS ===\n');
  let passed = 0, failed = 0;

  const check = (label, condition, info) => {
    if (condition) { console.log('  PASS:', label, info || ''); passed++; }
    else           { console.log('  FAIL:', label, info || ''); failed++; }
  };

  // TEST 1: POST COD order
  console.log('TEST 1: Place COD order');
  const r1 = await request('POST', '/api/orders', {
    userId: 'testuser_cod',
    sellerId: '69c3f809f3255d9fd6053214',
    items: [{ productId: '69c423ce0c4cafb085df132c', name: 'iphone', price: 7000000, quantity: 1 }],
    delivery: { type: 'terminal', name: 'Kampala Terminal', fee: 15000, estimatedDays: '2-3' },
    paymentMethod: 'cod', subtotal: 7000000, deliveryFee: 15000,
    customerInfo: { fullName: 'Test COD', phone: '0771234567', address: '', city: 'Kampala', notes: '' }
  });
  check('POST /api/orders (COD)', r1.status === 201, '| orderId: ' + r1.body.orderId);
  check('success flag is true', r1.body.success === true);
  const codOrderId = r1.body.orderId;

  // TEST 2: POST MTN payment order
  console.log('\nTEST 2: Place MTN payment order');
  const r2 = await request('POST', '/api/orders', {
    userId: 'testuser_mtn',
    sellerId: '69c3f809f3255d9fd6053214',
    items: [{ productId: '69c423ce0c4cafb085df132c', name: 'iphone', price: 7000000, quantity: 2 }],
    delivery: { type: 'zone', name: 'Kampala Central', fee: 5000, estimatedDays: '1-2' },
    paymentMethod: 'mtn', subtotal: 14000000, deliveryFee: 5000,
    customerInfo: { fullName: 'Test MTN', phone: '0761234567', address: 'Nakasero', city: 'Kampala', notes: 'Handle with care' }
  });
  check('POST /api/orders (MTN)', r2.status === 201, '| orderId: ' + r2.body.orderId);
  const mtnOrderId = r2.body.orderId;

  // TEST 3: GET orders by userId
  console.log('\nTEST 3: Fetch orders by userId');
  const r3 = await request('GET', '/api/orders?userId=testuser_cod');
  check('GET /api/orders?userId', r3.status === 200);
  check('Returns array', Array.isArray(r3.body.orders));
  check('Has 1 order', r3.body.orders?.length === 1);
  const o = r3.body.orders?.[0];
  check('paymentMethod is cod', o?.paymentMethod === 'cod');
  check('status is pending', o?.status === 'pending');
  check('subtotal correct', o?.subtotal === 7000000);
  check('items saved', o?.items?.length === 1);
  check('delivery saved', o?.delivery?.name === 'Kampala Terminal');
  check('customerInfo saved', o?.customerInfo?.fullName === 'Test COD');

  // TEST 4: PATCH order status
  console.log('\nTEST 4: Update order status');
  const r4 = await request('PATCH', '/api/orders/' + codOrderId + '/status', { status: 'processing' });
  check('PATCH /api/orders/:id/status', r4.status === 200);
  check('Status updated to processing', r4.body.order?.status === 'processing');

  // TEST 5: GET by sellerId
  console.log('\nTEST 5: Fetch orders by sellerId');
  const r5 = await request('GET', '/api/orders?sellerId=69c3f809f3255d9fd6053214');
  check('GET /api/orders?sellerId', r5.status === 200);
  check('Has at least 2 orders', r5.body.orders?.length >= 2);

  // TEST 6: Verify DB directly
  console.log('\nTEST 6: Verify orders in MongoDB');
  await mongoose.connect(process.env.MONGODB_URI);
  const Order = mongoose.models.CustomerOrder || mongoose.model('CustomerOrder', new mongoose.Schema({}, { strict: false }));
  const dbOrders = await Order.find({ userId: { $in: ['testuser_cod', 'testuser_mtn'] } }).lean();
  check('Both orders in DB', dbOrders.length === 2);
  check('COD order has correct paymentMethod', dbOrders.find(o => o.userId === 'testuser_cod')?.paymentMethod === 'cod');
  check('MTN order has correct paymentMethod', dbOrders.find(o => o.userId === 'testuser_mtn')?.paymentMethod === 'mtn');

  // Cleanup
  console.log('\nCleaning up test data...');
  const del = await Order.deleteMany({ userId: { $in: ['testuser_cod', 'testuser_mtn'] } });
  console.log('Deleted', del.deletedCount, 'test orders');
  await mongoose.disconnect();

  console.log('\n=== RESULTS:', passed, 'passed,', failed, 'failed ===');
}

runTests().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
