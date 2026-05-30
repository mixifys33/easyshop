require('dotenv').config();
const connectDB = require('./config/database');
const Application = require('./models/Application');
const Campaign = require('./models/Campaign');

connectDB().then(async () => {
  const pCount = await Application.countDocuments({ status: 'active', isDraft: { $ne: true } });
  const cCount = await Campaign.countDocuments({ status: 'active' });
  const cats = await Application.distinct('category', { status: 'active', isDraft: { $ne: true } });

  console.log('Applications (active):', pCount);
  console.log('Campaigns (active):', cCount);
  console.log('Categories:', cats);

  if (pCount > 0) {
    const sample = await Application.findOne({ status: 'active' }).select('title salePrice category').lean();
    console.log('Sample application:', JSON.stringify(sample));
  }

  // Test the fetchApplications logic directly
  const q = 'phone';
  const results = await Application.find({
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
