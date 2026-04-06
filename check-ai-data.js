require('dotenv').config();
const connectDB = require('./config/database');
const Product = require('./models/Product');
const Campaign = require('./models/Campaign');
const DeliveryTerminal = require('./models/DeliveryTerminal');

connectDB().then(async () => {
  const pCount = await Product.countDocuments({ status: 'active', isDraft: { $ne: true } });
  const cCount = await Campaign.countDocuments({ status: 'active' });
  const tCount = await DeliveryTerminal.countDocuments({ active: true });
  const cats = await Product.distinct('category', { status: 'active', isDraft: { $ne: true } });

  console.log('Products (active):', pCount);
  console.log('Campaigns (active):', cCount);
  console.log('Terminals (active):', tCount);
  console.log('Categories:', cats);

  if (pCount > 0) {
    const sample = await Product.findOne({ status: 'active' }).select('title salePrice category').lean();
    console.log('Sample product:', JSON.stringify(sample));
  }

  // Test the fetchProducts logic directly
  const q = 'phone';
  const results = await Product.find({
    status: 'active',
    isDraft: { $ne: true },
    $or: [
      { title: { $regex: q, $options: 'i' } },
      { category: { $regex: q, $options: 'i' } },
      { brand: { $regex: q, $options: 'i' } },
    ],
  }).select('title salePrice category').limit(5).lean();
  console.log('Search "phone" results:', results.length, results.map(p => p.title));

  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
