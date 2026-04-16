const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');

// ── Auth middleware ───────────────────────────────────────────────────────────
function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.userId = jwt.verify(token, process.env.JWT_SECRET).userId;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ── GET /api/user/addresses ───────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('addresses').lean();
    const addresses = (user?.addresses || []).map(a => ({ ...a, id: a._id }));
    res.json({ success: true, addresses });
  } catch (e) {
    console.error('[addresses GET]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/user/addresses ──────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const { label, type, fullName, phone, street, apartment, city, region, country, postalCode, isDefault } = req.body;

    if (!fullName || !street || !city) {
      return res.status(400).json({ error: 'fullName, street and city are required' });
    }

    // Check if user has any addresses to decide default
    const existing = await User.findById(req.userId).select('addresses').lean();
    const hasAddresses = existing?.addresses?.length > 0;
    const makeDefault = isDefault || !hasAddresses;

    // Build the new address subdocument with a fresh ObjectId
    const newAddr = {
      _id: new mongoose.Types.ObjectId(),
      label: label || 'Home',
      type: type || 'home',
      fullName,
      phone: phone || '',
      street,
      apartment: apartment || '',
      city,
      region: region || '',
      country: country || 'Uganda',
      postalCode: postalCode || '',
      isDefault: makeDefault,
    };

    // Only unset existing defaults if there are existing addresses
    if (makeDefault && hasAddresses) {
      await User.updateOne(
        { _id: req.userId },
        { $set: { 'addresses.$[].isDefault': false } }
      );
    }

    // Push the new address — use $push which works even if field doesn't exist yet
    await User.findByIdAndUpdate(
      req.userId,
      { $push: { addresses: newAddr } },
      { upsert: false }
    );

    res.json({ success: true, address: { ...newAddr, id: newAddr._id } });
  } catch (e) {
    console.error('[addresses POST]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/user/addresses/:id ─────────────────────────────────────────────
router.patch('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const fields = ['label', 'type', 'fullName', 'phone', 'street', 'apartment', 'city', 'region', 'country', 'postalCode', 'isDefault'];
    const update = {};
    fields.forEach(f => {
      if (req.body[f] !== undefined) update[`addresses.$.${f}`] = req.body[f];
    });

    if (req.body.isDefault) {
      const existing = await User.findById(req.userId).select('addresses').lean();
      if (existing?.addresses?.length) {
        await User.updateOne(
          { _id: req.userId },
          { $set: { 'addresses.$[].isDefault': false } }
        );
      }
    }

    await User.findOneAndUpdate(
      { _id: req.userId, 'addresses._id': id },
      { $set: update }
    );

    res.json({ success: true });
  } catch (e) {
    console.error('[addresses PATCH]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/user/addresses/:id/default ─────────────────────────────────────
router.patch('/:id/default', auth, async (req, res) => {
  try {
    const { id } = req.params;
    // Only unset if addresses exist
    const existing = await User.findById(req.userId).select('addresses').lean();
    if (existing?.addresses?.length) {
      await User.updateOne(
        { _id: req.userId },
        { $set: { 'addresses.$[].isDefault': false } }
      );
    }
    await User.findOneAndUpdate(
      { _id: req.userId, 'addresses._id': id },
      { $set: { 'addresses.$.isDefault': true } }
    );
    res.json({ success: true });
  } catch (e) {
    console.error('[addresses default]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/user/addresses/:id ────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    await User.findByIdAndUpdate(req.userId, {
      $pull: { addresses: { _id: id } },
    });
    res.json({ success: true });
  } catch (e) {
    console.error('[addresses DELETE]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
