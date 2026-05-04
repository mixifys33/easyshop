const mongoose = require('mongoose');
const Application = require('./models/Application');
const Seller = require('./models/Seller');
require('dotenv').config();

// Connect to database
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/vettcode', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function testApplications() {
  try {
    console.log('🧪 Testing Application Model and Operations...\n');

    // Find a seller to use for testing
    const seller = await Seller.findOne();
    if (!seller) {
      console.log('❌ No sellers found. Please create a seller first.');
      return;
    }
    console.log('✅ Found seller:', seller.name);

    // Test 1: Create a sample application
    console.log('\n📝 Test 1: Creating sample application...');
    const sampleApp = new Application({
      appName: 'React Dashboard Pro',
      shortDescription: 'A modern, responsive admin dashboard built with React and Material-UI',
      detailedDescription: 'This is a comprehensive admin dashboard template featuring user management, analytics, charts, and more. Built with React 18, Material-UI, and TypeScript for maximum performance and maintainability.',
      tags: 'react, dashboard, admin, material-ui, typescript',
      appCategory: 'Dashboard/Admin Panel',
      technologyStack: ['React', 'TypeScript', 'Material-UI', 'Node.js', 'MongoDB'],
      liveDemo: 'https://react-dashboard-pro-demo.com',
      githubRepo: 'https://github.com/example/react-dashboard-pro',
      documentationUrl: 'https://docs.react-dashboard-pro.com',
      screenshots: [
        {
          url: 'https://example.com/screenshot1.jpg',
          fileName: 'dashboard-overview.jpg',
          uploaded: true
        },
        {
          url: 'https://example.com/screenshot2.jpg',
          fileName: 'user-management.jpg',
          uploaded: true
        }
      ],
      appIcon: {
        url: 'https://example.com/icon.png',
        fileName: 'app-icon.png',
        uploaded: true
      },
      supportedPlatforms: ['Web Browser', 'Chrome Extension'],
      technicalRequirements: [
        { name: 'Node.js', value: '>= 16.0.0' },
        { name: 'Browser', value: 'Chrome 90+, Firefox 88+, Safari 14+' }
      ],
      dependencies: [
        { name: 'react', version: '^18.0.0', description: 'React library' },
        { name: '@mui/material', version: '^5.0.0', description: 'Material-UI components' },
        { name: 'typescript', version: '^4.5.0', description: 'TypeScript compiler' }
      ],
      licenseType: 'MIT License',
      price: 49.99,
      currency: 'USD',
      commercialUse: 'Yes',
      resaleRights: 'No',
      supportLevel: 'Email',
      updateFrequency: 'Active',
      warranty: '6 months',
      installationSupport: 'Yes',
      sellerId: seller._id,
      verificationStatus: 'verified',
      isDraft: false
    });

    await sampleApp.save();
    console.log('✅ Sample application created:', sampleApp.appName);
    console.log('   - ID:', sampleApp._id);
    console.log('   - Slug:', sampleApp.slug);
    console.log('   - Formatted Price:', sampleApp.formattedPrice);

    // Test 2: Create a draft application
    console.log('\n📝 Test 2: Creating draft application...');
    const draftApp = new Application({
      appName: 'Mobile E-commerce App',
      shortDescription: 'React Native e-commerce app with payment integration',
      sellerId: seller._id,
      isDraft: true,
      draftExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days
    });

    await draftApp.save();
    console.log('✅ Draft application created:', draftApp.appName);
    console.log('   - Expires at:', draftApp.draftExpiresAt);

    // Test 3: Search applications
    console.log('\n🔍 Test 3: Searching applications...');
    const searchResults = await Application.searchApplications('react dashboard');
    console.log('✅ Search results for "react dashboard":', searchResults.length);
    searchResults.forEach(app => {
      console.log(`   - ${app.appName} (${app.appCategory})`);
    });

    // Test 4: Find applications by seller
    console.log('\n👤 Test 4: Finding applications by seller...');
    const sellerApps = await Application.findBySeller(seller._id);
    console.log('✅ Applications by seller:', sellerApps.length);
    sellerApps.forEach(app => {
      console.log(`   - ${app.appName} (${app.verificationStatus})`);
    });

    // Test 5: Find drafts by seller
    console.log('\n📄 Test 5: Finding drafts by seller...');
    const sellerDrafts = await Application.findDraftsBySeller(seller._id);
    console.log('✅ Drafts by seller:', sellerDrafts.length);
    sellerDrafts.forEach(draft => {
      console.log(`   - ${draft.appName} (expires: ${draft.draftExpiresAt})`);
    });

    // Test 6: Increment views and downloads
    console.log('\n📊 Test 6: Testing analytics...');
    console.log('   - Views before:', sampleApp.views);
    console.log('   - Downloads before:', sampleApp.downloads);
    
    await sampleApp.incrementViews();
    await sampleApp.incrementDownloads();
    
    console.log('   - Views after:', sampleApp.views);
    console.log('   - Downloads after:', sampleApp.downloads);

    // Test 7: Category statistics
    console.log('\n📈 Test 7: Category statistics...');
    const categoryStats = await Application.aggregate([
      {
        $match: {
          isDraft: false,
          isActive: true,
          verificationStatus: 'verified'
        }
      },
      {
        $group: {
          _id: '$appCategory',
          count: { $sum: 1 },
          avgPrice: { $avg: '$price' },
          avgRating: { $avg: '$rating' }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);
    
    console.log('✅ Category statistics:');
    categoryStats.forEach(stat => {
      console.log(`   - ${stat._id}: ${stat.count} apps, avg price: $${stat.avgPrice?.toFixed(2)}, avg rating: ${stat.avgRating?.toFixed(1)}`);
    });

    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`   - Total applications: ${await Application.countDocuments()}`);
    console.log(`   - Published applications: ${await Application.countDocuments({ isDraft: false })}`);
    console.log(`   - Draft applications: ${await Application.countDocuments({ isDraft: true })}`);
    console.log(`   - Verified applications: ${await Application.countDocuments({ verificationStatus: 'verified' })}`);

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run tests
testApplications();