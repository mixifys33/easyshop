const mongoose = require('mongoose');
const User = require('../models/User');
const Seller = require('../models/Seller');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
require('dotenv').config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected for seeding chat data');
  } catch (error) {
    console.error('Database connection error:', error);
    process.exit(1);
  }
};

const seedChatData = async () => {
  try {
    console.log('🌱 Starting chat data seeding...');

    // Create some test users if they don't exist
    const testUsers = [
      {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123'
      },
      {
        name: 'Jane Smith',
        email: 'jane@example.com',
        password: 'password123'
      },
      {
        name: 'Mike Johnson',
        email: 'mike@example.com',
        password: 'password123'
      }
    ];

    const createdUsers = [];
    for (const userData of testUsers) {
      let user = await User.findOne({ email: userData.email });
      if (!user) {
        user = new User(userData);
        await user.save();
        console.log(`✅ Created test user: ${user.name}`);
      }
      createdUsers.push(user);
    }

    // Create some test sellers if they don't exist
    const testSellers = [
      {
        name: 'TechStore Uganda',
        email: 'techstore@example.com',
        password: 'password123',
        shopName: 'TechStore Uganda'
      },
      {
        name: 'Fashion Hub',
        email: 'fashion@example.com',
        password: 'password123',
        shopName: 'Fashion Hub'
      }
    ];

    const createdSellers = [];
    for (const sellerData of testSellers) {
      let seller = await Seller.findOne({ email: sellerData.email });
      if (!seller) {
        seller = new Seller(sellerData);
        await seller.save();
        console.log(`✅ Created test seller: ${seller.name}`);
      }
      createdSellers.push(seller);
    }

    // Create some public messages
    const publicMessages = [
      {
        conversation: null,
        sender: {
          user: createdUsers[0]._id,
          userType: 'User',
          name: createdUsers[0].name,
          email: createdUsers[0].email,
          avatar: null
        },
        content: {
          text: 'Welcome to vettcode public chat! 🎉',
          type: 'text'
        },
        status: 'sent'
      },
      {
        conversation: null,
        sender: {
          user: createdUsers[1]._id,
          userType: 'User',
          name: createdUsers[1].name,
          email: createdUsers[1].email,
          avatar: null
        },
        content: {
          text: 'Hey everyone! Just got my order delivered super fast! 🚚',
          type: 'text'
        },
        status: 'sent'
      },
      {
        conversation: null,
        sender: {
          user: createdSellers[0]._id,
          userType: 'Seller',
          name: createdSellers[0].name,
          email: createdSellers[0].email,
          avatar: null
        },
        content: {
          text: 'Thanks for choosing TechStore Uganda! We have new iPhone 15 in stock! 📱',
          type: 'text'
        },
        status: 'sent'
      },
      {
        conversation: null,
        sender: {
          user: createdUsers[2]._id,
          userType: 'User',
          name: createdUsers[2].name,
          email: createdUsers[2].email,
          avatar: null
        },
        content: {
          text: 'Anyone selling MacBook Pro? Looking for a good deal 💻',
          type: 'text'
        },
        status: 'sent'
      }
    ];

    // Clear existing public messages
    await Message.deleteMany({ conversation: null });
    
    // Create public messages
    for (const messageData of publicMessages) {
      const message = new Message(messageData);
      await message.save();
      console.log(`✅ Created public message: ${message.content.text.substring(0, 50)}...`);
    }

    // Create a test conversation between user and seller
    const conversation = new Conversation({
      type: 'private',
      participants: [
        {
          user: createdUsers[0]._id,
          userType: 'User',
          name: createdUsers[0].name,
          email: createdUsers[0].email,
          avatar: null
        },
        {
          user: createdSellers[0]._id,
          userType: 'Seller',
          name: createdSellers[0].name,
          email: createdSellers[0].email,
          avatar: null
        }
      ]
    });

    await conversation.save();
    console.log(`✅ Created conversation between ${createdUsers[0].name} and ${createdSellers[0].name}`);

    // Create some messages in the conversation
    const conversationMessages = [
      {
        conversation: conversation._id,
        sender: {
          user: createdUsers[0]._id,
          userType: 'User',
          name: createdUsers[0].name,
          email: createdUsers[0].email,
          avatar: null
        },
        content: {
          text: 'Hi! Is the iPhone 15 Pro still available?',
          type: 'text'
        },
        status: 'delivered'
      },
      {
        conversation: conversation._id,
        sender: {
          user: createdSellers[0]._id,
          userType: 'Seller',
          name: createdSellers[0].name,
          email: createdSellers[0].email,
          avatar: null
        },
        content: {
          text: 'Yes, it\'s still available! Would you like to know more details?',
          type: 'text'
        },
        status: 'delivered'
      },
      {
        conversation: conversation._id,
        sender: {
          user: createdUsers[0]._id,
          userType: 'User',
          name: createdUsers[0].name,
          email: createdUsers[0].email,
          avatar: null
        },
        content: {
          text: 'What\'s the condition and price?',
          type: 'text'
        },
        status: 'delivered'
      },
      {
        conversation: conversation._id,
        sender: {
          user: createdSellers[0]._id,
          userType: 'Seller',
          name: createdSellers[0].name,
          email: createdSellers[0].email,
          avatar: null
        },
        content: {
          text: 'It\'s brand new, never used. Price is UGX 4,500,000. Still in original packaging with warranty.',
          type: 'text'
        },
        status: 'sent'
      }
    ];

    for (const messageData of conversationMessages) {
      const message = new Message(messageData);
      await message.save();
      console.log(`✅ Created conversation message: ${message.content.text.substring(0, 50)}...`);
    }

    // Update conversation with last message
    const lastMessage = await Message.findOne({ conversation: conversation._id }).sort({ createdAt: -1 });
    conversation.lastMessage = lastMessage._id;
    conversation.lastActivity = lastMessage.createdAt;
    await conversation.save();

    console.log('🎉 Chat data seeding completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`- Created ${createdUsers.length} test users`);
    console.log(`- Created ${createdSellers.length} test sellers`);
    console.log(`- Created ${publicMessages.length} public messages`);
    console.log(`- Created 1 conversation with ${conversationMessages.length} messages`);
    console.log('\n🚀 You can now test the chat system!');

  } catch (error) {
    console.error('❌ Error seeding chat data:', error);
  } finally {
    mongoose.connection.close();
  }
};

// Run the seeding
connectDB().then(() => {
  seedChatData();
});

module.exports = { seedChatData };