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

// ── ANALYTICS ROUTES ─────────────────────────────────────────────────────────

// GET /api/admin/analytics/users — user analytics
router.get('/analytics/users', adminAuth, async (req, res) => {
  try {
    const mongoose = require('mongoose');
    // Use CustomerOrder (the real order model used by the app)
    const CustomerOrder = mongoose.models.CustomerOrder ||
      mongoose.model('CustomerOrder', new mongoose.Schema({}, { strict: false }), 'customerorders');

    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo  = new Date(now - 7  * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      newUsersLast30,
      newUsersLast7,
      bannedUsers,
      totalOrders,
      paidOrders,
      cancelledOrders,
      totalRevenue,
      userGrowth,
      topBuyers,
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      User.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      User.countDocuments({ isBanned: true }),
      CustomerOrder.countDocuments({}),
      CustomerOrder.countDocuments({ paymentStatus: { $in: ['paid', 'submitted'] } }),
      CustomerOrder.countDocuments({ status: 'cancelled' }),
      CustomerOrder.aggregate([
        { $match: { paymentStatus: { $in: ['paid', 'submitted'] } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      // User registrations per day for last 30 days
      User.aggregate([
        { $match: { createdAt: { $gte: thirtyDaysAgo } } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        }},
        { $sort: { _id: 1 } },
      ]),
      // Top buyers by order count
      CustomerOrder.aggregate([
        { $match: { paymentStatus: { $in: ['paid', 'submitted'] } } },
        { $group: { _id: '$userId', orderCount: { $sum: 1 }, totalSpent: { $sum: '$total' } } },
        { $sort: { totalSpent: -1 } },
        { $limit: 10 },
      ]),
    ]);

    // Count unique buyers (distinct userIds who placed any order)
    const uniqueBuyerAgg = await CustomerOrder.aggregate([
      { $match: { userId: { $exists: true, $ne: null, $ne: '' } } },
      { $group: { _id: '$userId' } },
      { $count: 'total' },
    ]);
    const uniqueBuyers = uniqueBuyerAgg[0]?.total || 0;

    // Count unique paid buyers
    const uniquePaidBuyerAgg = await CustomerOrder.aggregate([
      { $match: { paymentStatus: { $in: ['paid', 'submitted'] }, userId: { $exists: true, $ne: null, $ne: '' } } },
      { $group: { _id: '$userId' } },
      { $count: 'total' },
    ]);
    const uniquePaidBuyers = uniquePaidBuyerAgg[0]?.total || 0;

    // Enrich top buyers with user info
    const buyerIds = topBuyers.map(b => b._id).filter(Boolean);
    const buyerUsers = await User.find({ _id: { $in: buyerIds } }).select('name email').lean();
    const buyerMap = Object.fromEntries(buyerUsers.map(u => [String(u._id), u]));
    const enrichedBuyers = topBuyers.map(b => ({
      ...b,
      name: buyerMap[b._id]?.name || 'Unknown',
      email: buyerMap[b._id]?.email || '',
    }));

    const totalRev = totalRevenue[0]?.total || 0;
    // conversionRate = unique buyers who paid / total users (meaningful conversion)
    const conversionRate = totalUsers > 0 ? Number(((uniquePaidBuyers / totalUsers) * 100).toFixed(1)) : 0;
    const buyRate = totalOrders > 0 ? Number(((paidOrders / totalOrders) * 100).toFixed(1)) : 0;

    res.json({
      success: true,
      summary: {
        totalUsers,
        newUsersLast30,
        newUsersLast7,
        bannedUsers,
        totalOrders,
        paidOrders,
        cancelledOrders,
        uniqueBuyers,       // distinct users who placed any order
        uniquePaidBuyers,   // distinct users who paid
        totalRevenue: Number(totalRev.toFixed(2)),
        conversionRate,
        buyRate,
        cancelRate: totalOrders > 0 ? Number(((cancelledOrders / totalOrders) * 100).toFixed(1)) : 0,
      },
      userGrowth,
      topBuyers: enrichedBuyers,
    });
  } catch (err) {
    console.error('[Admin] User analytics error:', err);
    res.status(500).json({ error: 'Failed to load user analytics' });
  }
});

// GET /api/admin/analytics/sellers — seller analytics
router.get('/analytics/sellers', adminAuth, async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const CustomerOrder = mongoose.models.CustomerOrder ||
      mongoose.model('CustomerOrder', new mongoose.Schema({}, { strict: false }), 'customerorders');

    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [
      totalSellers,
      activeSellers,
      pendingSellers,
      suspendedSellers,
      newSellersLast30,
      sellerGrowth,
      allApplications,
      allSellers,
    ] = await Promise.all([
      Seller.countDocuments({}),
      Seller.countDocuments({ status: 'active' }),
      Seller.countDocuments({ approvalStatus: 'pending_review' }),
      Seller.countDocuments({ status: 'suspended' }),
      Seller.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      Seller.aggregate([
        { $match: { createdAt: { $gte: thirtyDaysAgo } } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        }},
        { $sort: { _id: 1 } },
      ]),
      Application.find({ isDraft: false })
        .select('sellerId price isFree views downloads verificationStatus appCategory appName')
        .lean(),
      Seller.find({}).select('_id name shop status approvalStatus createdAt').lean(),
    ]);

    // Per-seller stats from applications
    const sellerStatsMap = {};
    allApplications.forEach(app => {
      const sid = String(app.sellerId);
      if (!sellerStatsMap[sid]) {
        sellerStatsMap[sid] = { appCount: 0, totalViews: 0, totalDownloads: 0, revenue: 0, verifiedApps: 0 };
      }
      sellerStatsMap[sid].appCount++;
      sellerStatsMap[sid].totalViews += app.views || 0;
      sellerStatsMap[sid].totalDownloads += app.downloads || 0;
      if (app.verificationStatus === 'verified') sellerStatsMap[sid].verifiedApps++;
      if (!app.isFree && app.price > 0) {
        sellerStatsMap[sid].revenue += (app.price || 0) * (app.downloads || 0);
      }
    });

    // Enrich sellers
    const enrichedSellers = allSellers.map(s => ({
      id: s._id,
      name: s.shop?.shopName || s.name,
      status: s.status,
      approvalStatus: s.approvalStatus,
      joinedAt: s.createdAt,
      ...(sellerStatsMap[String(s._id)] || { appCount: 0, totalViews: 0, totalDownloads: 0, revenue: 0, verifiedApps: 0 }),
    }));

    const topByRevenue   = [...enrichedSellers].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    const topByDownloads = [...enrichedSellers].sort((a, b) => b.totalDownloads - a.totalDownloads).slice(0, 10);
    const topByApps      = [...enrichedSellers].sort((a, b) => b.appCount - a.appCount).slice(0, 10);

    // Category breakdown
    const catMap = {};
    allApplications.forEach(app => {
      const cat = app.appCategory || 'Other';
      if (!catMap[cat]) catMap[cat] = { category: cat, count: 0, downloads: 0, revenue: 0 };
      catMap[cat].count++;
      catMap[cat].downloads += app.downloads || 0;
      if (!app.isFree && app.price > 0) catMap[cat].revenue += (app.price || 0) * (app.downloads || 0);
    });

    const totalPlatformRevenue = allApplications.reduce((s, a) => {
      if (!a.isFree && a.price > 0) return s + (a.price || 0) * (a.downloads || 0);
      return s;
    }, 0);

    res.json({
      success: true,
      summary: {
        totalSellers,
        activeSellers,
        pendingSellers,
        suspendedSellers,
        newSellersLast30,
        totalApplications: allApplications.length,
        verifiedApplications: allApplications.filter(a => a.verificationStatus === 'verified').length,
        totalPlatformRevenue: Number(totalPlatformRevenue.toFixed(2)),
        totalDownloads: allApplications.reduce((s, a) => s + (a.downloads || 0), 0),
        totalViews: allApplications.reduce((s, a) => s + (a.views || 0), 0),
      },
      sellerGrowth,
      topByRevenue,
      topByDownloads,
      topByApps,
      categoryBreakdown: Object.values(catMap).sort((a, b) => b.downloads - a.downloads),
    });
  } catch (err) {
    console.error('[Admin] Seller analytics error:', err);
    res.status(500).json({ error: 'Failed to load seller analytics' });
  }
});

// GET /api/admin/analytics/overview — overall platform analytics & finances
router.get('/analytics/overview', adminAuth, async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const CustomerOrder = mongoose.models.CustomerOrder ||
      mongoose.model('CustomerOrder', new mongoose.Schema({}, { strict: false }), 'customerorders');

    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo  = new Date(now - 7  * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      totalSellers,
      activeSellers,
      totalApplications,
      verifiedApplications,
      allOrders,
      revenueAgg,
      revenueThisMonth,
      revenueThisWeek,
      ordersByStatus,
      revenueByDay,
      ordersByDay,
      allApplications,
    ] = await Promise.all([
      User.countDocuments({}),
      Seller.countDocuments({}),
      Seller.countDocuments({ status: 'active' }),
      Application.countDocuments({ isDraft: false }),
      Application.countDocuments({ isDraft: false, verificationStatus: 'verified' }),
      CustomerOrder.countDocuments({}),
      CustomerOrder.aggregate([
        { $match: { paymentStatus: { $in: ['paid', 'submitted'] } } },
        { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } },
      ]),
      CustomerOrder.aggregate([
        { $match: { paymentStatus: { $in: ['paid', 'submitted'] }, createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      CustomerOrder.aggregate([
        { $match: { paymentStatus: { $in: ['paid', 'submitted'] }, createdAt: { $gte: sevenDaysAgo } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      CustomerOrder.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      // Revenue per day last 30 days
      CustomerOrder.aggregate([
        { $match: { paymentStatus: { $in: ['paid', 'submitted'] }, createdAt: { $gte: thirtyDaysAgo } } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 },
        }},
        { $sort: { _id: 1 } },
      ]),
      // Orders per day last 30 days
      CustomerOrder.aggregate([
        { $match: { createdAt: { $gte: thirtyDaysAgo } } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        }},
        { $sort: { _id: 1 } },
      ]),
      Application.find({ isDraft: false })
        .select('price isFree views downloads verificationStatus appCategory appName sellerId')
        .lean(),
    ]);

    const totalRev = revenueAgg[0]?.total || 0;
    const paidOrderCount = revenueAgg[0]?.count || 0;
    const revThisMonth = revenueThisMonth[0]?.total || 0;
    const revThisWeek  = revenueThisWeek[0]?.total || 0;

    const statusMap = {};
    ordersByStatus.forEach(s => { statusMap[s._id] = s.count; });

    const totalDownloads = allApplications.reduce((s, a) => s + (a.downloads || 0), 0);
    const totalViews     = allApplications.reduce((s, a) => s + (a.views || 0), 0);
    const appRevenue     = allApplications.reduce((s, a) => {
      if (!a.isFree && a.price > 0) return s + (a.price || 0) * (a.downloads || 0);
      return s;
    }, 0);

    // Top applications overall
    const topApps = [...allApplications]
      .filter(a => !a.isFree && a.price > 0)
      .map(a => ({ ...a, revenue: (a.price || 0) * (a.downloads || 0) }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    res.json({
      success: true,
      summary: {
        totalUsers,
        totalSellers,
        activeSellers,
        totalApplications,
        verifiedApplications,
        totalOrders: allOrders,
        paidOrders: paidOrderCount,
        pendingOrders: statusMap['pending'] || 0,
        cancelledOrders: statusMap['cancelled'] || 0,
        totalRevenue: Number(totalRev.toFixed(2)),
        revenueThisMonth: Number(revThisMonth.toFixed(2)),
        revenueThisWeek: Number(revThisWeek.toFixed(2)),
        totalDownloads,
        totalViews,
        appRevenue: Number(appRevenue.toFixed(2)),
        conversionRate: totalViews > 0 ? Number(((totalDownloads / totalViews) * 100).toFixed(1)) : 0,
        avgOrderValue: paidOrderCount > 0 ? Number((totalRev / paidOrderCount).toFixed(2)) : 0,
      },
      revenueByDay,
      ordersByDay,
      topApps,
    });
  } catch (err) {
    console.error('[Admin] Overview analytics error:', err);
    res.status(500).json({ error: 'Failed to load overview analytics' });
  }
});

module.exports = router;
