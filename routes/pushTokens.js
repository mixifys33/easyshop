/**
 * Push Token Routes
 * POST /api/push-tokens/register        — save / update a device token
 * POST /api/push-tokens/send            — send a notification (admin only)
 * POST /api/push-tokens/send-to-sellers — broadcast to all sellers (admin only)
 * POST /api/push-tokens/send-to-users   — broadcast to all customers (admin only)
 * GET  /api/push-tokens/list            — list all tokens (admin only)
 * GET  /api/push-tokens/stats           — token statistics (admin only)
 * DELETE /api/push-tokens/:token        — remove a token
 */

const express = require('express');
const router = express.Router();
const PushToken = require('../models/PushToken');
const { Expo } = require('expo-server-sdk');

const expo = new Expo();

// ── Simple admin key check (header: x-admin-key) ────────────────────────────
const ADMIN_EMAIL = 'admin@eshop.ug';

function requireAdmin(req, res, next) {
  const adminKey = req.headers['x-admin-key'];
  // Accept either the admin key header or a flag set by the admin login route
  if (adminKey === process.env.ADMIN_SECRET_KEY || req.isAdmin) {
    return next();
  }
  return res.status(403).json({ error: 'Admin access required' });
}

// ── Helper: send messages in chunks ─────────────────────────────────────────
async function sendChunked(messages) {
  const chunks = expo.chunkPushNotifications(messages);
  const tickets = [];
  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
    } catch (err) {
      console.error('[Push] Chunk send error:', err.message);
    }
  }
  return tickets;
}

// ── Register / update a push token ──────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { token, userId, platform, userType } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    // Validate it's a real Expo push token
    if (!Expo.isExpoPushToken(token)) {
      return res.status(400).json({ error: 'Invalid Expo push token format' });
    }

    const validUserType = ['user', 'seller', 'admin', 'guest'].includes(userType)
      ? userType
      : 'user';

    // Upsert — update if token exists, create if not
    await PushToken.findOneAndUpdate(
      { token },
      {
        token,
        userId: userId || null,
        platform: platform || 'android',
        userType: validUserType,
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: 'Push token registered successfully' });
  } catch (err) {
    console.error('[PushToken] Register error:', err);
    res.status(500).json({ error: 'Failed to register push token' });
  }
});

// ── Send push notification to specific target ────────────────────────────────
// Body: { title, body, data, targetUserId, targetUserType, adminKey }
router.post('/send', async (req, res) => {
  try {
    const { title, body, data, targetUserId, targetUserType, adminKey } = req.body;

    // Validate admin key in body or header
    const key = adminKey || req.headers['x-admin-key'];
    if (key !== process.env.ADMIN_SECRET_KEY) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (!title || !body) {
      return res.status(400).json({ error: 'title and body are required' });
    }

    // Build query
    const query = {};
    if (targetUserId) query.userId = targetUserId;
    if (targetUserType) query.userType = targetUserType;

    const tokens = await PushToken.find(query).select('token').lean();

    if (tokens.length === 0) {
      return res.json({ success: true, sent: 0, message: 'No tokens found for target' });
    }

    const messages = tokens
      .filter(t => Expo.isExpoPushToken(t.token))
      .map(t => ({
        to: t.token,
        sound: 'default',
        title,
        body,
        data: data || {},
        priority: 'high',
        channelId: 'default',
      }));

    const tickets = await sendChunked(messages);
    const sent = tickets.filter(t => t.status === 'ok').length;
    const failed = tickets.filter(t => t.status === 'error').length;

    console.log(`[Push] Sent: ${sent}, Failed: ${failed}`);
    res.json({ success: true, sent, failed, total: messages.length });
  } catch (err) {
    console.error('[Push] Send error:', err);
    res.status(500).json({ error: 'Failed to send notifications' });
  }
});

// ── Broadcast to all sellers ─────────────────────────────────────────────────
router.post('/send-to-sellers', async (req, res) => {
  try {
    const { title, body, data, adminKey } = req.body;
    const key = adminKey || req.headers['x-admin-key'];
    if (key !== process.env.ADMIN_SECRET_KEY) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    if (!title || !body) {
      return res.status(400).json({ error: 'title and body are required' });
    }

    const tokens = await PushToken.find({ userType: 'seller' }).select('token').lean();
    if (tokens.length === 0) {
      return res.json({ success: true, sent: 0, message: 'No seller tokens found' });
    }

    const messages = tokens
      .filter(t => Expo.isExpoPushToken(t.token))
      .map(t => ({
        to: t.token,
        sound: 'default',
        title,
        body,
        data: data || {},
        priority: 'high',
        channelId: 'default',
      }));

    const tickets = await sendChunked(messages);
    const sent = tickets.filter(t => t.status === 'ok').length;
    const failed = tickets.filter(t => t.status === 'error').length;

    res.json({ success: true, sent, failed, total: messages.length });
  } catch (err) {
    console.error('[Push] Send-to-sellers error:', err);
    res.status(500).json({ error: 'Failed to send notifications to sellers' });
  }
});

// ── Broadcast to all customers ───────────────────────────────────────────────
router.post('/send-to-users', async (req, res) => {
  try {
    const { title, body, data, adminKey } = req.body;
    const key = adminKey || req.headers['x-admin-key'];
    if (key !== process.env.ADMIN_SECRET_KEY) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    if (!title || !body) {
      return res.status(400).json({ error: 'title and body are required' });
    }

    const tokens = await PushToken.find({ userType: 'user' }).select('token').lean();
    if (tokens.length === 0) {
      return res.json({ success: true, sent: 0, message: 'No customer tokens found' });
    }

    const messages = tokens
      .filter(t => Expo.isExpoPushToken(t.token))
      .map(t => ({
        to: t.token,
        sound: 'default',
        title,
        body,
        data: data || {},
        priority: 'high',
        channelId: 'default',
      }));

    const tickets = await sendChunked(messages);
    const sent = tickets.filter(t => t.status === 'ok').length;
    const failed = tickets.filter(t => t.status === 'error').length;

    res.json({ success: true, sent, failed, total: messages.length });
  } catch (err) {
    console.error('[Push] Send-to-users error:', err);
    res.status(500).json({ error: 'Failed to send notifications to customers' });
  }
});

// ── Broadcast to everyone ────────────────────────────────────────────────────
router.post('/broadcast', async (req, res) => {
  try {
    const { title, body, data, adminKey } = req.body;
    const key = adminKey || req.headers['x-admin-key'];
    if (key !== process.env.ADMIN_SECRET_KEY) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    if (!title || !body) {
      return res.status(400).json({ error: 'title and body are required' });
    }

    const tokens = await PushToken.find({}).select('token').lean();
    if (tokens.length === 0) {
      return res.json({ success: true, sent: 0, message: 'No tokens found' });
    }

    const messages = tokens
      .filter(t => Expo.isExpoPushToken(t.token))
      .map(t => ({
        to: t.token,
        sound: 'default',
        title,
        body,
        data: data || {},
        priority: 'high',
        channelId: 'default',
      }));

    const tickets = await sendChunked(messages);
    const sent = tickets.filter(t => t.status === 'ok').length;
    const failed = tickets.filter(t => t.status === 'error').length;

    res.json({ success: true, sent, failed, total: messages.length });
  } catch (err) {
    console.error('[Push] Broadcast error:', err);
    res.status(500).json({ error: 'Failed to broadcast notifications' });
  }
});

// ── List all tokens (admin) ──────────────────────────────────────────────────
router.get('/list', async (req, res) => {
  try {
    const key = req.headers['x-admin-key'];
    if (key !== process.env.ADMIN_SECRET_KEY) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const tokens = await PushToken.find({}).lean();
    res.json({ success: true, count: tokens.length, tokens });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tokens' });
  }
});

// ── Token statistics (admin) ─────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const key = req.headers['x-admin-key'];
    if (key !== process.env.ADMIN_SECRET_KEY) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const [total, users, sellers, admins, guests, android, ios] = await Promise.all([
      PushToken.countDocuments({}),
      PushToken.countDocuments({ userType: 'user' }),
      PushToken.countDocuments({ userType: 'seller' }),
      PushToken.countDocuments({ userType: 'admin' }),
      PushToken.countDocuments({ userType: 'guest' }),
      PushToken.countDocuments({ platform: 'android' }),
      PushToken.countDocuments({ platform: 'ios' }),
    ]);

    res.json({
      success: true,
      stats: {
        total,
        byUserType: { users, sellers, admins, guests },
        byPlatform: { android, ios, web: total - android - ios },
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch token stats' });
  }
});

// ── Remove a token ───────────────────────────────────────────────────────────
router.delete('/:token', async (req, res) => {
  try {
    await PushToken.findOneAndDelete({ token: req.params.token });
    res.json({ success: true, message: 'Token removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove token' });
  }
});

module.exports = router;
