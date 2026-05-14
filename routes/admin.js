/**
 * Admin Routes
 * POST /api/admin/login          â€” admin login (returns JWT)
 * GET  /api/admin/dashboard      â€” dashboard stats
 * GET  /api/admin/sellers        â€” all sellers with stats
 * GET  /api/admin/sellers/pending â€” pending approval sellers
 * PATCH /api/admin/sellers/:id/approve â€” approve a seller
 * PATCH /api/admin/sellers/:id/reject  â€” reject a seller
 * PATCH /api/admin/sellers/:id/suspend â€” suspend a seller
 * GET  /api/admin/users          â€” all customers
 * GET  /api/admin/orders         â€” all orders
 * GET  /api/admin/products       â€” all products
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Seller = require('../models/Seller');
const User = require('../models/User');
const PushToken = require('../models/PushToken');
const { Expo } = require('expo-server-sdk');

const expo = new Expo();

// â”€â”€ Admin credentials (from env) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin@eshop.ug';
const ADMIN_NAME     = process.env.ADMIN_NAME     || 'Masereka Adorable Kimulya';
const ADMIN_PHONE    = process.env.ADMIN_PHONE    || '+256761819885';
const ADMIN_PASSWORD = 'Hacker X1234567'; // In production, store hashed in DB
const ADMIN_SECRET   = process.env.ADMIN_SECRET_KEY || 'eshop-admin-secret-2025-x9k2m';

// â”€â”€ Admin auth middleware â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function adminAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.isAdmin) return res.status(403).json({ error: 'Admin access required' });
    req.adminId = decoded.adminId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired admin token' });
  }
}

// â”€â”€ POST /api/admin/login â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Check admin credentials
    if (email.toLowerCase().trim() !== ADMIN_EMAIL.toLowerCase()) {
      return res.status(401).json({ error: 'Invalid admin credentials' });
    }

    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid admin credentials' });
    }

    // Issue a JWT with isAdmin flag
    const token = jwt.sign(
      {
        adminId: 'admin-masereka-001',
        email: ADMIN_EMAIL,
        name: ADMIN_NAME,
        isAdmin: true,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const admin = {
      id: 'admin-masereka-001',
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      phone: ADMIN_PHONE,
      isAdmin: true,
      role: 'admin',
    };

    console.log(`[Admin] Login successful: ${ADMIN_EMAIL}`);

    res.json({
      success: true,
      message: 'Admin login successful',
      token,
      admin,
      adminSecret: ADMIN_SECRET, // returned so the app can use it for push API calls
    });
  } catch (err) {
    console.error('[Admin] Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// â”€â”€ GET /api/admin/dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/dashboard', adminAuth, async (req, res) => {
  try {
    const Order = require('../models/Order');
    const Product = require('../models/Product');
    const Application = require('../models/Application');

    const [
      totalSellers,
      pendingSellers,
      activeSellers,
      suspendedSellers,
      totalUsers,
      totalProducts,
      totalOrders,
      totalApplications,
      pendingApplications,
      verifiedApplications,
      pushTokenStats,
    ] = await Promise.all([
      Seller.countDocuments({}),
      Seller.countDocuments({ approvalStatus: 'pending_review' }),
      Seller.countDocuments({ status: 'active' }),
      Seller.countDocuments({ status: 'suspended' }),
      User.countDocuments({}),
      Product.countDocuments({}),
      Order.countDocuments({}),
      Application.countDocuments({ isDraft: false }),
      Application.countDocuments({ isDraft: false, verificationStatus: 'pending' }),
      Application.countDocuments({ isDraft: false, verificationStatus: 'verified' }),
      PushToken.aggregate([
        { $group: { _id: '$userType', count: { $sum: 1 } } }
      ]),
    ]);

    const pushStats = { users: 0, sellers: 0, admins: 0, total: 0 };
    pushTokenStats.forEach(s => {
      pushStats[s._id + 's'] = s.count;
      pushStats.total += s.count;
    });

    res.json({
      success: true,
      stats: {
        sellers: { total: totalSellers, pending: pendingSellers, active: activeSellers, suspended: suspendedSellers },
        users: { total: totalUsers },
        products: { total: totalProducts },
        orders: { total: totalOrders },
        applications: { total: totalApplications, pending: pendingApplications, verified: verifiedApplications },
        pushTokens: pushStats,
      },
    });
  } catch (err) {
    console.error('[Admin] Dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard stats' });
  }
});

// â”€â”€ GET /api/admin/sellers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/sellers', adminAuth, async (req, res) => {
  try {
    const { status, approvalStatus, page = 1, limit = 20 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (approvalStatus) query.approvalStatus = approvalStatus;

    const sellers = await Seller.find(query)
      .select('-password -verificationToken -resetPasswordToken')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await Seller.countDocuments(query);

    res.json({ success: true, sellers, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('[Admin] Get sellers error:', err);
    res.status(500).json({ error: 'Failed to fetch sellers' });
  }
});

// â”€â”€ GET /api/admin/sellers/pending â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/sellers/pending', adminAuth, async (req, res) => {
  try {
    const sellers = await Seller.find({ approvalStatus: 'pending_review' })
      .select('-password -verificationToken -resetPasswordToken')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, sellers, count: sellers.length });
  } catch (err) {
    console.error('[Admin] Get pending sellers error:', err);
    res.status(500).json({ error: 'Failed to fetch pending sellers' });
  }
});

// â”€â”€ PATCH /api/admin/sellers/:id/approve â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.patch('/sellers/:id/approve', adminAuth, async (req, res) => {
  try {
    const seller = await Seller.findByIdAndUpdate(
      req.params.id,
      { approvalStatus: 'approved', status: 'active', approvedAt: new Date() },
      { new: true }
    ).select('-password');

    if (!seller) return res.status(404).json({ error: 'Seller not found' });

    // Send push notification to the seller if they have a token
    const tokenDoc = await PushToken.findOne({ userId: seller._id, userType: 'seller' });
    if (tokenDoc && Expo.isExpoPushToken(tokenDoc.token)) {
      await expo.sendPushNotificationsAsync([{
        to: tokenDoc.token,
        sound: 'default',
        title: 'ðŸŽ‰ Account Approved!',
        body: `Congratulations ${seller.name}! Your seller account has been approved. Start selling now!`,
        data: { type: 'account_approved' },
        priority: 'high',
        channelId: 'default',
      }]);
    }

    res.json({ success: true, message: 'Seller approved successfully', seller });
  } catch (err) {
    console.error('[Admin] Approve seller error:', err);
    res.status(500).json({ error: 'Failed to approve seller' });
  }
});

// â”€â”€ PATCH /api/admin/sellers/:id/reject â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.patch('/sellers/:id/reject', adminAuth, async (req, res) => {
  try {
    const { reason } = req.body;
    const seller = await Seller.findByIdAndUpdate(
      req.params.id,
      { approvalStatus: 'rejected', status: 'pending', rejectionReason: reason || 'Application rejected by admin' },
      { new: true }
    ).select('-password');

    if (!seller) return res.status(404).json({ error: 'Seller not found' });

    // Notify seller
    const tokenDoc = await PushToken.findOne({ userId: seller._id, userType: 'seller' });
    if (tokenDoc && Expo.isExpoPushToken(tokenDoc.token)) {
      await expo.sendPushNotificationsAsync([{
        to: tokenDoc.token,
        sound: 'default',
        title: 'Application Update',
        body: `Your seller application was not approved. Reason: ${reason || 'Please contact support for details.'}`,
        data: { type: 'account_rejected' },
        priority: 'high',
        channelId: 'default',
      }]);
    }

    res.json({ success: true, message: 'Seller rejected', seller });
  } catch (err) {
    console.error('[Admin] Reject seller error:', err);
    res.status(500).json({ error: 'Failed to reject seller' });
  }
});

// â”€â”€ PATCH /api/admin/sellers/:id/suspend â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.patch('/sellers/:id/suspend', adminAuth, async (req, res) => {
  try {
    const { reason } = req.body;
    const seller = await Seller.findByIdAndUpdate(
      req.params.id,
      { status: 'suspended', suspensionReason: reason || 'Suspended by admin' },
      { new: true }
    ).select('-password');

    if (!seller) return res.status(404).json({ error: 'Seller not found' });

    res.json({ success: true, message: 'Seller suspended', seller });
  } catch (err) {
    console.error('[Admin] Suspend seller error:', err);
    res.status(500).json({ error: 'Failed to suspend seller' });
  }
});

// â”€â”€ PATCH /api/admin/sellers/:id/unsuspend â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.patch('/sellers/:id/unsuspend', adminAuth, async (req, res) => {
  try {
    const seller = await Seller.findByIdAndUpdate(
      req.params.id,
      { status: 'active', $unset: { suspensionReason: '' } },
      { new: true }
    ).select('-password');

    if (!seller) return res.status(404).json({ error: 'Seller not found' });

    res.json({ success: true, message: 'Seller unsuspended', seller });
  } catch (err) {
    console.error('[Admin] Unsuspend seller error:', err);
    res.status(500).json({ error: 'Failed to unsuspend seller' });
  }
});

// â”€â”€ GET /api/admin/users â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/users', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', sort = 'newest', role } = req.query;

    // Build query
    const query = {};
    if (role) query.role = role;
    if (search.trim()) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    // Sort options
    const sortMap = {
      newest:   { createdAt: -1 },
      oldest:   { createdAt: 1 },
      name_asc: { name: 1 },
      name_desc:{ name: -1 },
    };
    const sortObj = sortMap[sort] || { createdAt: -1 };

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password')
        .sort(sortObj)
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(query),
    ]);

    res.json({ success: true, users, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('[Admin] Get users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// â”€â”€ GET /api/admin/users/:id â€” full user detail with orders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/users/:id', adminAuth, async (req, res) => {
  try {
    const Order = require('../models/Order');

    const [user, orders] = await Promise.all([
      User.findById(req.params.id).select('-password').lean(),
      Order.find({ 'buyerInfo.userId': req.params.id })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
    ]);

    if (!user) return res.status(404).json({ error: 'User not found' });

    // Order stats
    const totalSpent = orders
      .filter(o => !['cancelled'].includes(o.status?.toLowerCase()))
      .reduce((sum, o) => sum + (o.subtotal || 0) + (o.deliveryFee || 0), 0);

    res.json({
      success: true,
      user,
      orders,
      stats: {
        totalOrders: orders.length,
        totalSpent,
        completedOrders: orders.filter(o => o.status?.toLowerCase() === 'delivered').length,
        pendingOrders: orders.filter(o => o.status?.toLowerCase() === 'pending').length,
        cancelledOrders: orders.filter(o => o.status?.toLowerCase() === 'cancelled').length,
      },
    });
  } catch (err) {
    console.error('[Admin] Get user detail error:', err);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

// â”€â”€ PATCH /api/admin/users/:id/ban â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.patch('/users/:id/ban', adminAuth, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBanned: true, bannedAt: new Date() },
      { new: true }
    ).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, message: 'User banned', user });
  } catch (err) {
    res.status(500).json({ error: 'Failed to ban user' });
  }
});

// â”€â”€ PATCH /api/admin/users/:id/unban â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.patch('/users/:id/unban', adminAuth, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBanned: false, $unset: { bannedAt: '' } },
      { new: true }
    ).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, message: 'User unbanned', user });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unban user' });
  }
});

// â”€â”€ GET /api/admin/orders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/orders', adminAuth, async (req, res) => {
  try {
    const Order = require('../models/Order');
    const { page = 1, limit = 20, status } = req.query;
    const query = status ? { status } : {};

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await Order.countDocuments(query);
    res.json({ success: true, orders, total });
  } catch (err) {
    console.error('[Admin] Get orders error:', err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// â”€â”€ GET /api/admin/products â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/products', adminAuth, async (req, res) => {
  try {
    const Product = require('../models/Product');
    const { page = 1, limit = 20 } = req.query;

    const products = await Product.find({})
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await Product.countDocuments({});
    res.json({ success: true, products, total });
  } catch (err) {
    console.error('[Admin] Get products error:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// ── APPLICATION MANAGEMENT ROUTES ────────────────────────────────────────────
const Application = require('../models/Application');

// GET /api/admin/applications — list all applications with optional status filter
router.get('/applications', adminAuth, async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.verificationStatus = status;
    const applications = await Application.find(filter)
      .populate('sellerId', 'name email shop')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();
    const total = await Application.countDocuments(filter);
    res.json({ success: true, applications, total });
  } catch (err) {
    console.error('[Admin] Get applications error:', err);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// GET /api/admin/applications/:id — get single application detail
router.get('/applications/:id', adminAuth, async (req, res) => {
  try {
    const app = await Application.findById(req.params.id)
      .populate('sellerId', 'name email shop')
      .lean();
    if (!app) return res.status(404).json({ error: 'Application not found' });
    res.json({ success: true, application: app });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch application' });
  }
});

// PATCH /api/admin/applications/:id/review — full admin review
router.patch('/applications/:id/review', adminAuth, async (req, res) => {
  try {
    const { status, adminRating, completionScore, badges, boostLabel, reason, adminNotes, customLabel } = req.body;
    
    console.log('[Admin] Review request:', {
      applicationId: req.params.id,
      status,
      adminRating,
      completionScore,
      badges,
      boostLabel,
      reason,
      adminNotes,
      customLabel,
      adminId: req.adminId
    });
    
    const app = await Application.findById(req.params.id);
    if (!app) {
      console.error('[Admin] Application not found:', req.params.id);
      return res.status(404).json({ error: 'Application not found' });
    }

    if (status) app.verificationStatus = status;
    if (adminRating !== undefined) app.adminRating = Number(adminRating);
    if (completionScore !== undefined) app.completionScore = Number(completionScore);
    if (badges) app.badges = badges;
    if (boostLabel) app.boostLabel = boostLabel;
    if (reason !== undefined) app.verificationNotes = reason;
    if (adminNotes !== undefined) app.adminNotes = adminNotes;
    if (customLabel !== undefined) app.customLabel = customLabel;
    app.reviewedAt = new Date();
    app.reviewedBy = req.adminId;

    console.log('[Admin] Saving application with updates...');
    await app.save();
    
    console.log('[Admin] Application saved successfully');
    res.json({ success: true, message: `Application ${status || 'updated'} successfully`, application: app });
  } catch (err) {
    console.error('[Admin] Review application error:', err);
    console.error('[Admin] Error stack:', err.stack);
    console.error('[Admin] Error details:', {
      name: err.name,
      message: err.message,
      errors: err.errors
    });
    res.status(500).json({ 
      error: 'Failed to review application',
      details: err.message,
      validationErrors: err.errors ? Object.keys(err.errors).map(key => ({
        field: key,
        message: err.errors[key].message
      })) : []
    });
  }
});

// PATCH /api/admin/applications/:id/boost — quick boost/unboost
router.patch('/applications/:id/boost', adminAuth, async (req, res) => {
  try {
    const { boostLabel } = req.body;
    const app = await Application.findByIdAndUpdate(req.params.id, { boostLabel }, { new: true });
    if (!app) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, application: app });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update boost' });
  }
});

module.exports = router;
