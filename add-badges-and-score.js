require('dotenv').config();
const mongoose = require('mongoose');
const Application = require('./models/Application');

async function addBadgesAndScore() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Find the application
    const appId = '6a050440a03d58507aa86eb1';
    const application = await Application.findById(appId);

    if (!application) {
      console.log('❌ Application not found');
      process.exit(1);
    }

    console.log(`📦 Found application: ${application.appName}`);
    console.log(`Current badges: ${application.badges?.length || 0}`);
    console.log(`Current completion score: ${application.completionScore || 'Not set'}`);

    // Add badges if not present
    if (!application.badges || application.badges.length === 0) {
      application.badges = [
        'Verified Application',
        'Editor\'s Choice',
        'Trending This Week',
        'Best Seller',
        'Premium Quality'
      ];
      console.log('✅ Added 5 badges');
    } else {
      console.log('ℹ️ Application already has badges');
    }

    // Add completion score if not present
    if (!application.completionScore && !application.adminCompletionScore) {
      application.completionScore = 95;
      console.log('✅ Set completion score to 95%');
    } else {
      console.log('ℹ️ Application already has completion score');
    }

    // Save the application
    await application.save();
    console.log('✅ Application updated successfully!');

    // Display updated data
    console.log('\n📊 Updated Application Data:');
    console.log(`- App Name: ${application.appName}`);
    console.log(`- Badges: ${application.badges.join(', ')}`);
    console.log(`- Completion Score: ${application.completionScore}%`);
    console.log(`- Downloads: ${application.downloads || 0}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

addBadgesAndScore();
