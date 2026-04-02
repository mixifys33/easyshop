const express = require('express');
const router = express.Router();
const DeliveryTerminal = require('../models/DeliveryTerminal');
const Seller = require('../models/Seller');

// Official Link Bus Uganda terminals — real contacts & addresses
const UGANDA_TERMINALS = [
  // ── CENTRAL ───────────────────────────────────────────────────────────────
  { name: 'Link Bus - Kampala', company: 'Link Bus', type: 'bus_terminal', region: 'Central', district: 'Kampala', city: 'Kampala', address: 'Solar House, Katwe / Namirembe Road, Kampala', phone: '+256 702 269 674 / +256 774 957 041' },
  { name: 'Link Bus - Kiboga', company: 'Link Bus', type: 'bus_terminal', region: 'Central', district: 'Kiboga', city: 'Kiboga', address: 'Kiboga Town Stage', phone: '+256 788 669 990' },
  { name: 'Link Bus - Mubende', company: 'Link Bus', type: 'bus_terminal', region: 'Central', district: 'Mubende', city: 'Mubende', address: 'Mubende Highway Terminal', phone: '+256 700 896 871 / +256 703 519 588' },
  // ── WESTERN ───────────────────────────────────────────────────────────────
  { name: 'Link Bus - Fort Portal', company: 'Link Bus', type: 'bus_terminal', region: 'Western', district: 'Kabarole', city: 'Fort Portal', address: 'Kamuhigi Road Terminal, Fort Portal', phone: '+256 782 434 178 / +256 701 966 181' },
  { name: 'Link Bus - Kasese', company: 'Link Bus', type: 'bus_terminal', region: 'Western', district: 'Kasese', city: 'Kasese', address: 'Kasese Main Terminal', phone: '+256 755 719 743 / +256 701 548 686' },
  { name: 'Link Bus - Hoima', company: 'Link Bus', type: 'bus_terminal', region: 'Western', district: 'Hoima', city: 'Hoima', address: 'Hoima Bus Terminal', phone: '+256 757 222 743' },
  { name: 'Link Bus - Masindi', company: 'Link Bus', type: 'bus_terminal', region: 'Western', district: 'Masindi', city: 'Masindi', address: 'Masindi Main Terminal', phone: '+256 702 855 482' },
  { name: 'Link Bus - Bundibugyo', company: 'Link Bus', type: 'bus_terminal', region: 'Western', district: 'Bundibugyo', city: 'Bundibugyo', address: 'Bundibugyo Town Terminal', phone: '+256 703 236 441' },
  { name: 'Link Bus - Bwera (Congo Border)', company: 'Link Bus', type: 'bus_terminal', region: 'Western', district: 'Kasese', city: 'Bwera', address: 'Mpondwe Terminal, Congo Border', phone: '+256 702 616 582' },
  { name: 'Link Bus - Kagadi', company: 'Link Bus', type: 'bus_terminal', region: 'Western', district: 'Kagadi', city: 'Kagadi', address: 'Kagadi Terminal', phone: '+256 781 756 957' },
  { name: 'Link Bus - Muhooro', company: 'Link Bus', type: 'bus_terminal', region: 'Western', district: 'Kikuube', city: 'Muhooro', address: 'Muhooro Town Stage', phone: '+256 779 528 532' },
];

// ── SEED terminals (run once) ─────────────────────────────────────────────
router.post('/terminals/seed', async (req, res) => {
  try {
    const existing = await DeliveryTerminal.countDocuments();
    if (existing > 0) {
      return res.json({ success: true, message: `Already seeded (${existing} terminals exist)` });
    }
    const inserted = await DeliveryTerminal.insertMany(UGANDA_TERMINALS);
    res.json({ success: true, message: `Seeded ${inserted.length} terminals`, count: inserted.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET all terminals (with optional filters) ─────────────────────────────
router.get('/terminals', async (req, res) => {
  try {
    const { region, district, company, type, search } = req.query;
    const filter = { active: true };

    if (region) filter.region = new RegExp(region, 'i');
    if (district) filter.district = new RegExp(district, 'i');
    if (company) filter.company = new RegExp(company, 'i');
    if (type) filter.type = type;
    if (search) {
      filter.$or = [
        { name: new RegExp(search, 'i') },
        { city: new RegExp(search, 'i') },
        { district: new RegExp(search, 'i') },
        { company: new RegExp(search, 'i') },
      ];
    }

    const terminals = await DeliveryTerminal.find(filter).sort({ region: 1, district: 1, name: 1 });
    res.json({ success: true, terminals });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET single terminal ───────────────────────────────────────────────────
router.get('/terminals/:id', async (req, res) => {
  try {
    const terminal = await DeliveryTerminal.findById(req.params.id);
    if (!terminal) return res.status(404).json({ success: false, message: 'Terminal not found' });
    res.json({ success: true, terminal });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET delivery options for a product (buyer-facing) ────────────────────
router.get('/options/:sellerId', async (req, res) => {
  try {
    const seller = await Seller.findById(req.params.sellerId)
      .select('delivery shop.shopName')
      .populate('delivery.terminals');

    if (!seller) return res.status(404).json({ success: false, message: 'Seller not found' });

    const delivery = seller.delivery || {};

    // Active home delivery zones set by seller
    const zones = (delivery.zones || [])
      .filter(z => z.active)
      .map(z => ({
        id: z._id,
        name: z.name,
        fee: z.fee ?? 15000,
        estimatedDays: z.estimatedDays || '2-3',
        type: 'zone',
      }));

    // Always fetch ALL active Link Bus terminals from DB
    // (Link Bus is a shared carrier — any seller can ship via any terminal)
    const allTerminals = await DeliveryTerminal.find({ active: true })
      .sort({ region: 1, city: 1 })
      .lean();

    const terminals = allTerminals.map(t => ({
      id: t._id,
      name: t.name,
      city: t.city,
      district: t.district,
      region: t.region,
      address: t.address,
      phone: t.phone,
      fee: delivery.defaultTerminalFee ?? 15000,
      estimatedDays: '2-5',
      type: 'terminal',
    }));

    res.json({
      success: true,
      shopName: seller.shop?.shopName || 'Shop',
      freeDeliveryThreshold: delivery.freeDeliveryThreshold || 0,
      processingDays: delivery.processingDays || 1,
      zones,
      terminals,
      hasOptions: zones.length > 0 || terminals.length > 0,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET seller delivery settings ──────────────────────────────────────────
router.get('/seller/:sellerId', async (req, res) => {
  try {
    const seller = await Seller.findById(req.params.sellerId)
      .select('delivery shop.shopName')
      .populate('delivery.terminals');
    if (!seller) return res.status(404).json({ success: false, message: 'Seller not found' });
    res.json({ success: true, delivery: seller.delivery || {} });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── UPDATE seller delivery settings ──────────────────────────────────────
router.put('/seller/:sellerId', async (req, res) => {
  try {
    const { offersDelivery, offersPickup, freeDeliveryThreshold, processingDays, terminals, zones, notes } = req.body;

    const update = {};
    if (offersDelivery !== undefined) update['delivery.offersDelivery'] = offersDelivery;
    if (offersPickup !== undefined) update['delivery.offersPickup'] = offersPickup;
    if (freeDeliveryThreshold !== undefined) update['delivery.freeDeliveryThreshold'] = freeDeliveryThreshold;
    if (processingDays !== undefined) update['delivery.processingDays'] = processingDays;
    if (terminals !== undefined) update['delivery.terminals'] = terminals;
    if (zones !== undefined) update['delivery.zones'] = zones;
    if (notes !== undefined) update['delivery.notes'] = notes;

    const seller = await Seller.findByIdAndUpdate(
      req.params.sellerId,
      { $set: update },
      { new: true, upsert: false }
    ).select('delivery').populate('delivery.terminals');

    if (!seller) return res.status(404).json({ success: false, message: 'Seller not found' });
    res.json({ success: true, delivery: seller.delivery || {} });
  } catch (err) {
    console.error('PUT delivery error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
