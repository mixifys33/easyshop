/**
 * Admin Routes
 * POST /api/admin/login          — admin login (returns JWT)
 * GET  /api/admin/dashboard      — dashboard stats
 * GET  /api/admin/sellers        — all sellers with stats
 * GET  /api/admin/sellers/pending — pending approval sellers
 * PATCH /api/admin/sellers/:id/approve — approve a seller
 * PATCH /api/admin/sellers/:id/reject  — reject a seller
 * PATCH /api/admin/sellers/:id/suspend — suspend a seller
 * GET  /api/admin/users          — all customers
 * GET  /api/admin/orders         — all orders
 * GET  /api/admin/products       — all products
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

// ── Admin credentials (from env) ─────────────────────────────────────────────
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin@eshop.ug';
const ADMIN_NAME     = process.env.ADMIN_NAME     || 'Masereka Adorable Kimulya';
const ADMIN_PHONE    = process.env.ADMIN_PHONE    || '+256761819885';
const ADMIN_PASSWORD = 'Hacker X1234567'; // In production, store hashed in DB
const ADMIN_SECRET   = process.env.ADMIN_SECRET_KEY || 'eshop-admin-secret-2025-x9k2m';

// ── Admin auth middleware ────────────────────────────────────────────────────
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

// ── POST /api/admin/login ────────────────────────────────────────────────────
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

// ── GET /api/admin/dashboard ─────────────────────────────────────────────────
router.get('/dashboard', adminAuth, async (req, res) => {
  try {
    const Order = require('../models/Order');
    const Product = require('../models/Product');

    const [
      totalSellers,
      pendingSellers,
      activeSellers,
      suspendedSellers,
      totalUsers,
      totalProducts,
      totalOrders,
      pushTokenStats,
    ] = await Promise.all([
      Seller.countDocuments({}),
      Seller.countDocuments({ approvalStatus: 'pending_review' }),
      Seller.countDocuments({ status: 'active' }),
      Seller.countDocuments({ status: 'suspended' }),
      User.countDocuments({}),
      Product.countDocuments({}),
      Order.countDocuments({}),
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
        pushTokens: pushStats,
      },
    });
  } catch (err) {
    console.error('[Admin] Dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard stats' });
  }
});

// ── GET /api/admin/sellers ───────────────────────────────────────────────────
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

// ── GET /api/admin/sellers/pending ───────────────────────────────────────────
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

// ── PATCH /api/admin/sellers/:id/approve ────────────────────────────────────
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
        title: '🎉 Account Approved!',
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

// ── PATCH /api/admin/sellers/:id/reject ─────────────────────────────────────
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

// ── PATCH /api/admin/sellers/:id/suspend ────────────────────────────────────
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

// ── PATCH /api/admin/sellers/:id/unsuspend ───────────────────────────────────
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

// ── GET /api/admin/users ─────────────────────────────────────────────────────
router.get('/users', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const users = await User.find({})
      .select('-password')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await User.countDocuments({});
    res.json({ success: true, users, total });
  } catch (err) {
    console.error('[Admin] Get users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ── GET /api/admin/orders ────────────────────────────────────────────────────
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

// ── GET /api/admin/products ──────────────────────────────────────────────────
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

module.exports = router;
