const PushToken = require('../models/PushToken');
const Seller = require('../models/Seller');
const User = require('../models/User');
const { Expo } = require('expo-server-sdk');

const expo = new Expo();

async function sendExpoToTokens(tokenDocs, { title, body, data = {} }) {
  if (!title?.trim() || !body?.trim()) {
    throw new Error('title and body are required');
  }

  const messages = tokenDocs
    .filter((t) => t.token && Expo.isExpoPushToken(t.token))
    .map((t) => ({
      to: t.token,
      sound: 'default',
      title: title.trim(),
      body: body.trim(),
      data,
      priority: 'high',
      channelId: 'default',
    }));

  if (!messages.length) {
    return { sent: 0, failed: 0, total: 0 };
  }

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

  const sent = tickets.filter((t) => t.status === 'ok').length;
  const failed = tickets.filter((t) => t.status === 'error').length;

  return { sent, failed, total: messages.length };
}

async function getPushTokenStats() {
  const [tokens, sellerIds, userIds] = await Promise.all([
    PushToken.find({}).select('userId userType token').lean(),
    Seller.find({}).distinct('_id'),
    User.find({}).distinct('_id'),
  ]);

  const sellerSet = new Set(sellerIds.map((id) => String(id)));
  const userSet = new Set(userIds.map((id) => String(id)));

  const stats = { total: 0, users: 0, sellers: 0, guests: 0, invalid: 0 };

  for (const t of tokens) {
    if (!Expo.isExpoPushToken(t.token)) {
      stats.invalid += 1;
      continue;
    }
    stats.total += 1;

    if (t.userType === 'seller' || (t.userId && sellerSet.has(String(t.userId)))) {
      stats.sellers += 1;
    } else if (t.userType === 'user' || (t.userId && userSet.has(String(t.userId)))) {
      stats.users += 1;
    } else {
      stats.guests += 1;
    }
  }

  return stats;
}

async function getTokensForTarget(target) {
  if (target === 'sellers') {
    const sellerIds = await Seller.find({}).distinct('_id');
    return PushToken.find({ userId: { $in: sellerIds } }).select('token').lean();
  }
  if (target === 'users') {
    const userIds = await User.find({}).distinct('_id');
    return PushToken.find({ userId: { $in: userIds } }).select('token').lean();
  }
  return PushToken.find({}).select('token').lean();
}

async function sendPushByTarget({ title, body, target = 'all', data }) {
  const tokenDocs = await getTokensForTarget(target);
  const result = await sendExpoToTokens(tokenDocs, { title, body, data });
  return { ...result, target };
}

module.exports = {
  sendExpoToTokens,
  getPushTokenStats,
  sendPushByTarget,
};
