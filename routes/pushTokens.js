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
    const { token, userId, platform } = req.body;

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
      { token, userId: userId || null, platform: platform || 'android', updatedAt: new Date() },
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

module.exports = router;
