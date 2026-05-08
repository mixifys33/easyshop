const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/vettcode', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

// Define Application Schema (minimal for querying)
const applicationSchema = new mongoose.Schema({
  appName: String,
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller' },
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
  appCategory: String,
  price: Number,
  isFree: Boolean,
  verificationStatus: String,
  createdAt: Date,
}, { collection: 'applications' });

// Define Seller Schema (minimal for querying)
const sellerSchema = new mongoose.Schema({
  name: String,
  email: String,
  shopName: String,
  phone: String,
  status: String,
}, { collection: 'sellers' });

const Application = mongoose.model('Application', applicationSchema);
const Seller = mongoose.model('Seller', sellerSchema);

async function checkSellersWithApplications() {
  try {
    console.log('\n🔍 Checking sellers with applications...\n');

    // Get all applications
    const applications = await Application.find({})
      .populate('sellerId', 'name email shopName phone status')
      .sort({ createdAt: -1 });

    console.log(`📊 Total Applications in DB: ${applications.length}\n`);

    if (applications.length === 0) {
      console.log('⚠️  No applications found in the database.');
      return;
    }

    // Group applications by seller
    const sellerMap = new Map();

    applications.forEach(app => {
      const sellerId = app.sellerId?._id?.toString() || 'Unknown';
      
      if (!sellerMap.has(sellerId)) {
        sellerMap.set(sellerId, {
          seller: app.sellerId || { name: 'Unknown', email: 'N/A', shopName: 'N/A' },
          applications: [],
          totalApps: 0,
          freeApps: 0,
          paidApps: 0,
          verifiedApps: 0,
        });
      }

      const sellerData = sellerMap.get(sellerId);
      sellerData.applications.push({
        name: app.appName,
        category: app.appCategory,
        price: app.price,
        isFree: app.isFree,
        verified: app.verificationStatus === 'verified',
        createdAt: app.createdAt,
      });
      sellerData.totalApps++;
      
      if (app.isFree || app.price === 0) {
        sellerData.freeApps++;
      } else {
        sellerData.paidApps++;
      }
      
      if (app.verificationStatus === 'verified') {
        sellerData.verifiedApps++;
      }
    });

    // Display results
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`👥 SELLERS WITH APPLICATIONS: ${sellerMap.size}\n`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    let sellerIndex = 1;
    for (const [sellerId, data] of sellerMap.entries()) {
      const seller = data.seller;
      
      console.log(`\n${sellerIndex}. 👤 SELLER INFORMATION`);
      console.log('─────────────────────────────────────────────────────────────');
      console.log(`   Name:       ${seller.name || 'N/A'}`);
      console.log(`   Email:      ${seller.email || 'N/A'}`);
      console.log(`   Shop Name:  ${seller.shopName || 'N/A'}`);
      console.log(`   Phone:      ${seller.phone || 'N/A'}`);
      console.log(`   Status:     ${seller.status || 'N/A'}`);
      console.log(`   Seller ID:  ${sellerId}`);
      
      console.log(`\n   📱 APPLICATION STATS:`);
      console.log(`   ├─ Total Applications:    ${data.totalApps}`);
      console.log(`   ├─ Free Applications:     ${data.freeApps}`);
      console.log(`   ├─ Paid Applications:     ${data.paidApps}`);
      console.log(`   └─ Verified Applications: ${data.verifiedApps}`);
      
      console.log(`\n   📋 APPLICATIONS LIST:`);
      data.applications.forEach((app, idx) => {
        const priceStr = app.isFree || app.price === 0 ? 'FREE' : `$${app.price}`;
        const verifiedStr = app.verified ? '✓ Verified' : '✗ Not Verified';
        const dateStr = app.createdAt ? new Date(app.createdAt).toLocaleDateString() : 'N/A';
        
        console.log(`   ${idx + 1}. ${app.name || 'Unnamed App'}`);
        console.log(`      Category: ${app.category || 'N/A'} | Price: ${priceStr} | ${verifiedStr} | Created: ${dateStr}`);
      });
      
      console.log('\n─────────────────────────────────────────────────────────────');
      sellerIndex++;
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('\n📈 SUMMARY STATISTICS:');
    console.log('─────────────────────────────────────────────────────────────');
    
    let totalFree = 0;
    let totalPaid = 0;
    let totalVerified = 0;
    
    for (const data of sellerMap.values()) {
      totalFree += data.freeApps;
      totalPaid += data.paidApps;
      totalVerified += data.verifiedApps;
    }
    
    console.log(`Total Sellers:              ${sellerMap.size}`);
    console.log(`Total Applications:         ${applications.length}`);
    console.log(`Total Free Applications:    ${totalFree}`);
    console.log(`Total Paid Applications:    ${totalPaid}`);
    console.log(`Total Verified Apps:        ${totalVerified}`);
    console.log(`Avg Apps per Seller:        ${(applications.length / sellerMap.size).toFixed(2)}`);
    
    console.log('\n═══════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('✅ Database connection closed');
    process.exit(0);
  }
}

// Run the script
checkSellersWithApplications();
