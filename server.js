const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const connectDB = require('./config/database');
require('dotenv').config();

// Import models for socket authentication
const User = require('./models/User');
const Seller = require('./models/Seller');

// Import routes
const productRoutes = require('./routes/products');
const authRoutes = require('./routes/auth');
const sellerRoutes = require('./routes/sellers');
const categoryRoutes = require('./routes/categories');
const draftRoutes = require('./routes/drafts');
const imagekitRoutes = require('./routes/imagekit');
const aiRoutes = require('./routes/ai');
const orderRoutes = require('./routes/orders');
const paymentVerifyRoutes = require('./routes/paymentVerify');
const shopAIRoutes = require('./routes/shopAI');
const vettcodeAIRoutes = require('./routes/vettcodeAI');
const campaignRoutes = require('./routes/campaigns');
const cartRoutes = require('./routes/cart');
const wishlistRoutes = require('./routes/wishlist');
const reviewRoutes = require('./routes/reviews');
const userAddressRoutes = require('./routes/userAddresses');
const pushTokenRoutes = require('./routes/pushTokens');
const adminRoutes = require('./routes/admin');
const chatRoutes = require('./routes/chat');
const applicationRoutes = require('./routes/applications');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: function(origin, callback) {
      const allowed = [
        'http://localhost:3001',
        'http://localhost:3000',
        'http://localhost:8081',
        'http://localhost:3002',
        'http://localhost:8082',
        'https://global-investments.vercel.app',
        process.env.FRONTEND_URL,
      ].filter(Boolean);

      // Allow requests with no origin (mobile apps)
      if (!origin) return callback(null, true);

      if (allowed.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // Allow all for now
      }
    },
    credentials: true,
  }
});

const PORT = process.env.PORT || 3000;

// Connect to database
connectDB();

// Middleware
app.use(cors({
  origin: function(origin, callback) {
    const allowed = [
      'http://localhost:3001',
      'http://localhost:3000',
      'http://localhost:8081',
      'http://localhost:3002',
      'http://localhost:8082',
      'https://global-investments.vercel.app',
      process.env.FRONTEND_URL,
    ].filter(Boolean);

    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);

    if (allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all for now but with credentials support
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Allow Google OAuth popup to communicate back
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});

// ── Socket.IO Setup ──────────────────────────────────────────────────────
// Store connected users
const connectedUsers = new Map();

// Socket.IO authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Try to find user first
    let user = await User.findById(decoded.userId).select('-password');
    let userType = 'User';
    
    // If not found as user, try as seller
    if (!user) {
      user = await Seller.findById(decoded.userId).select('-password');
      userType = 'Seller';
    }

    if (!user) {
      return next(new Error('Authentication error: User not found'));
    }

    // Add user info to socket
    socket.userId = user._id.toString();
    socket.userType = userType;
    socket.userData = {
      id: user._id,
      name: user.name || user.shopName,
      email: user.email,
      avatar: user.profileImage,
      userType: userType
    };

    next();
  } catch (error) {
    next(new Error('Authentication error: Invalid token'));
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`🔌 User connected: ${socket.userData.name} (${socket.userData.userType})`);
  
  // Store connected user
  connectedUsers.set(socket.userId, {
    socketId: socket.id,
    userData: socket.userData,
    lastSeen: new Date()
  });

  // Join user to their personal room for private messages
  socket.join(`user_${socket.userId}`);
  
  // Join public chat room
  socket.join('public_chat');

  // Handle joining conversation rooms
  socket.on('join_conversation', (conversationId) => {
    socket.join(`conversation_${conversationId}`);
    console.log(`👥 ${socket.userData.name} joined conversation: ${conversationId}`);
  });

  // Handle leaving conversation rooms
  socket.on('leave_conversation', (conversationId) => {
    socket.leave(`conversation_${conversationId}`);
    console.log(`👋 ${socket.userData.name} left conversation: ${conversationId}`);
  });

  // Handle new message events
  socket.on('new_message', (data) => {
    // Emit to conversation room
    if (data.conversationId) {
      socket.to(`conversation_${data.conversationId}`).emit('message_received', data);
    }
  });

  // Handle new public message events
  socket.on('new_public_message', (data) => {
    // Emit to public chat room
    socket.to('public_chat').emit('public_message_received', data);
  });

  // Handle typing indicators
  socket.on('typing_start', (data) => {
    if (data.conversationId) {
      socket.to(`conversation_${data.conversationId}`).emit('user_typing', {
        userId: socket.userId,
        userName: socket.userData.name,
        conversationId: data.conversationId
      });
    }
  });

  socket.on('typing_stop', (data) => {
    if (data.conversationId) {
      socket.to(`conversation_${data.conversationId}`).emit('user_stopped_typing', {
        userId: socket.userId,
        conversationId: data.conversationId
      });
    }
  });

  // Handle message read events
  socket.on('message_read', (data) => {
    if (data.conversationId) {
      socket.to(`conversation_${data.conversationId}`).emit('message_marked_read', {
        messageId: data.messageId,
        userId: socket.userId,
        conversationId: data.conversationId
      });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`🔌 User disconnected: ${socket.userData.name}`);
    connectedUsers.delete(socket.userId);
  });

  // Send online users count to public chat
  socket.emit('online_users_count', connectedUsers.size);
  socket.to('public_chat').emit('online_users_count', connectedUsers.size);
});

// Make io available to routes
app.set('io', io);

// Routes
app.use('/api/products/draft', draftRoutes);
app.use('/api/products', productRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/sellers', sellerRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/imagekit', imagekitRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payment-verify', paymentVerifyRoutes);
app.use('/api/shop-ai', shopAIRoutes); // Legacy route
app.use('/api/vettcode-ai', vettcodeAIRoutes); // New VettCode AI route
app.use('/api/campaigns', campaignRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/user/addresses', userAddressRoutes);
app.use('/api/push-tokens', pushTokenRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/applications', applicationRoutes);

// Public shops listing — proxied through sellers router
app.use('/api/shops', sellerRoutes);

// Alias routes — map old monorepo-style endpoints to the standalone backend auth routes
app.post('/api/user-registration', (req, res, next) => {
  req.url = '/register';
  authRoutes(req, res, next);
});

app.post('/api/verify-user', (req, res, next) => {
  req.url = '/verify-otp';
  authRoutes(req, res, next);
});

app.post('/api/login-user', (req, res, next) => {
  req.url = '/login';
  authRoutes(req, res, next);
});

app.post('/api/refresh-token', (req, res, next) => {
  req.url = '/refresh-token';
  authRoutes(req, res, next);
});

// ── Google OAuth login/signup ─────────────────────────────────────────────────
const fetch = require('node-fetch');

async function handleGoogleAuth(req, res, mode) {
  try {
    const { access_token, user_info } = req.body;
    if (!access_token || !user_info?.email) {
      return res.status(400).json({ message: 'Missing Google credentials' });
    }

    // Verify the access token with Google
    const verifyRes = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!verifyRes.ok) {
      return res.status(401).json({ message: 'Invalid Google access token' });
    }

    const email = user_info.email.toLowerCase();
    let user = await User.findOne({ email });

    if (!user) {
      user = new User({
        name: user_info.name || email.split('@')[0],
        email,
        password: `google_${Date.now()}_${Math.random()}`,
        avatar: user_info.picture || '',
        googleId: user_info.id,
        role: 'user',
      });
      await user.save();
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.json({
      success: true,
      message: mode === 'login' ? 'Google login successful' : 'Google signup successful',
      token,
      user: { id: user._id, name: user.name, email: user.email, avatar: user.avatar, role: user.role },
    });
  } catch (error) {
    console.error(`Google ${mode} error:`, error.message);
    res.status(500).json({ message: 'Google authentication failed', error: error.message });
  }
}

app.post('/api/google-login',  (req, res) => handleGoogleAuth(req, res, 'login'));
app.post('/api/google-signup', (req, res) => handleGoogleAuth(req, res, 'signup'));

// ── Follow / Unfollow shop ────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.userId = jwt.verify(token, process.env.JWT_SECRET).userId;
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
}

app.post('/api/user/follow-shop', authMiddleware, async (req, res) => {
  try {
    const { shopId } = req.body;
    if (!shopId) return res.status(400).json({ error: 'shopId required' });
    await User.findByIdAndUpdate(req.userId, { $addToSet: { followedShops: shopId } });
    res.json({ success: true, isFollowing: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/user/unfollow-shop', authMiddleware, async (req, res) => {
  try {
    const { shopId } = req.body;
    if (!shopId) return res.status(400).json({ error: 'shopId required' });
    await User.findByIdAndUpdate(req.userId, { $pull: { followedShops: shopId } });
    res.json({ success: true, isFollowing: false });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/user/following/:shopId', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('followedShops').lean();
    const isFollowing = (user?.followedShops || []).map(String).includes(req.params.shopId);
    res.json({ success: true, isFollowing });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/user/following — list all followed shops with details
app.get('/api/user/following', authMiddleware, async (req, res) => {
  try {
    const Seller = require('./models/Seller');
    const user = await User.findById(req.userId).select('followedShops').lean();
    const ids = (user?.followedShops || []).filter(Boolean);

    if (!ids.length) return res.json({ success: true, following: [] });

    const sellers = await Seller.find({ _id: { $in: ids } })
      .select('_id name verified shop profileImage metrics')
      .lean();

    const following = sellers.map(s => ({
      id: s._id,
      name: s.shop?.shopName || s.name,
      bio: s.shop?.shopDescription || '',
      category: s.shop?.businessType || 'General',
      ratings: s.metrics?.rating || (s.verified ? 5 : 0),
      avatar: s.profileImage?.url || (typeof s.profileImage === 'string' ? s.profileImage : null) || s.shop?.logo?.url || null,
      coverBanner: s.shop?.banner?.url || null,
      productCount: 0,
      followedAt: new Date().toISOString(),
    }));

    res.json({ success: true, following });
  } catch (e) { res.status(500).json({ error: e.message }); }
});app.get('/api/logged-in-user', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'No token provided' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) return res.status(401).json({ message: 'User not found' });
    res.json({ user });
  } catch (error) {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ message: 'Backend server is running with database!' });
});

// Global error handler to ensure JSON responses
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  res.status(500).json({
    message: 'Internal server error',
    error: error.message || 'Something went wrong'
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    message: 'API endpoint not found',
    error: `Route ${req.method} ${req.originalUrl} not found`
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔌 Socket.IO enabled for real-time chat`);
});