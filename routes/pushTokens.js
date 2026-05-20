/**
 * Push Token Routes
 * POST /api/push-tokens/register  — save a device token
 * POST /api/push-tokens/send      — send a notification (admin only)
 * GET  /api/push-tokens/list      — list all tokens (admin only)
 */

const express = require('express');
const router = express.Router();
const PushToken = require('../models/PushToken');
const { Expo } = require('expo-server-sdk');

const expo = new Expo();

// ── Register / update a push token ──────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { token, userId, platform, userType } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    // Validate it's a real Expo push token
    if (!Expo.isExpoPushToken(token)) {
      return res.status(400).json({ error: 'Invalid Expo push token' });
    }

    // Upsert — update if token exists, create if not
    await PushToken.findOneAndUpdate(
      { token },
      {
        token,
        userId: userId || null,
        platform: platform || 'android',
        userType: userType || (userId ? 'user' : 'guest'),
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: 'Push token registered' });
  } catch (err) {
    console.error('[PushToken] Register error:', err);
    res.status(500).json({ error: 'Failed to register push token' });
  }
});

// ── Send push notification (admin) ───────────────────────────────────────────
router.post('/send', async (req, res) => {
  try {
    const { title, body, data, targetUserId } = req.body;

    if (!title || !body) {
      return res.status(400).json({ error: 'title and body are required' });
    }

    // Get tokens — either for a specific user or all tokens
    const query = targetUserId ? { userId: targetUserId } : {};
    const tokens = await PushToken.find(query).select('token').lean();

    if (tokens.length === 0) {
      return res.json({ success: true, sent: 0, message: 'No tokens found' });
    }

    // Build messages
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

    // Send in chunks (Expo limit is 100 per request)
    const chunks = expo.chunkPushNotifications(messages);
    const tickets = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (err) {
        console.error('[Push] Chunk send error:', err);
      }
    }

    const sent = tickets.filter(t => t.status === 'ok').length;
    const failed = tickets.filter(t => t.status === 'error').length;

    console.log(`[Push] Sent: ${sent}, Failed: ${failed}`);
    res.json({ success: true, sent, failed, total: messages.length });
  } catch (err) {
    console.error('[Push] Send error:', err);
    res.status(500).json({ error: 'Failed to send notifications' });
  }
});

// ── List all tokens (admin) ──────────────────────────────────────────────────
router.get('/list', async (req, res) => {
  try {
    const tokens = await PushToken.find({}).lean();
    res.json({ success: true, count: tokens.length, tokens });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tokens' });
  }
});

// ── Legacy admin endpoints (x-admin-key) — prefer /api/admin/notifications/* with JWT
const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY || 'eshop-admin-secret-2025-x9k2m';
const { getPushTokenStats, sendPushByTarget } = require('../services/pushNotificationService');

function requireAdminKey(req, res, next) {
  const key = req.headers['x-admin-key'] || req.body?.adminKey;
  if (key !== ADMIN_SECRET) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
}

router.get('/stats', requireAdminKey, async (req, res) => {
  try {
    const stats = await getPushTokenStats();
    res.json({
      success: true,
      stats: {
        total: stats.total,
        byUserType: { users: stats.users, sellers: stats.sellers, guests: stats.guests },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load stats' });
  }
});

async function legacySend(req, res, target) {
  try {
    const { title, body, data } = req.body;
    const result = await sendPushByTarget({ title, body, target, data });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

router.post('/broadcast', requireAdminKey, (req, res) => legacySend(req, res, 'all'));
router.post('/send-to-users', requireAdminKey, (req, res) => legacySend(req, res, 'users'));
router.post('/send-to-sellers', requireAdminKey, (req, res) => legacySend(req, res, 'sellers'));

module.exports = router;
