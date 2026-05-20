require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL)
  .then(async () => {
    const orders = mongoose.connection.collection('customerorders');
    const paymentStatuses = await orders.aggregate([
      { $group: { _id: '$paymentStatus', count: { $sum: 1 }, totalAmount: { $sum: '$total' } } }
    ]).toArray();
    console.log('Payment statuses:', JSON.stringify(paymentStatuses, null, 2));

    const orderStatuses = await orders.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]).toArray();
    console.log('Order statuses:', JSON.stringify(orderStatuses, null, 2));

    // Sample a few orders to see actual field values
    const sample = await orders.find({}).limit(3).toArray();
    sample.forEach(o => console.log('Sample order:', JSON.stringify({ paymentStatus: o.paymentStatus, status: o.status, total: o.total, subtotal: o.subtotal })));

    mongoose.disconnect();
  })
  .catch(e => console.error(e.message));
