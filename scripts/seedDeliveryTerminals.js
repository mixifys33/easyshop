require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const DeliveryTerminal = require('../models/DeliveryTerminal');

// Official Link Bus Uganda terminals with real contacts and addresses
const TERMINALS = [
  // ── CENTRAL REGION ────────────────────────────────────────────────────────
  {
    name: 'Link Bus - Kampala',
    company: 'Link Bus', type: 'bus_terminal', region: 'Central',
    district: 'Kampala', city: 'Kampala',
    address: 'Solar House, Katwe / Namirembe Road, Kampala',
    phone: '+256 702 269 674 / +256 774 957 041',
  },
  {
    name: 'Link Bus - Kiboga',
    company: 'Link Bus', type: 'bus_terminal', region: 'Central',
    district: 'Kiboga', city: 'Kiboga',
    address: 'Kiboga Town Stage',
    phone: '+256 788 669 990',
  },
  {
    name: 'Link Bus - Mubende',
    company: 'Link Bus', type: 'bus_terminal', region: 'Central',
    district: 'Mubende', city: 'Mubende',
    address: 'Mubende Highway Terminal',
    phone: '+256 700 896 871 / +256 703 519 588',
  },

  // ── WESTERN REGION ────────────────────────────────────────────────────────
  {
    name: 'Link Bus - Fort Portal',
    company: 'Link Bus', type: 'bus_terminal', region: 'Western',
    district: 'Kabarole', city: 'Fort Portal',
    address: 'Kamuhigi Road Terminal, Fort Portal',
    phone: '+256 782 434 178 / +256 701 966 181',
  },
  {
    name: 'Link Bus - Kasese',
    company: 'Link Bus', type: 'bus_terminal', region: 'Western',
    district: 'Kasese', city: 'Kasese',
    address: 'Kasese Main Terminal',
    phone: '+256 755 719 743 / +256 701 548 686',
  },
  {
    name: 'Link Bus - Hoima',
    company: 'Link Bus', type: 'bus_terminal', region: 'Western',
    district: 'Hoima', city: 'Hoima',
    address: 'Hoima Bus Terminal',
    phone: '+256 757 222 743',
  },
  {
    name: 'Link Bus - Masindi',
    company: 'Link Bus', type: 'bus_terminal', region: 'Western',
    district: 'Masindi', city: 'Masindi',
    address: 'Masindi Main Terminal',
    phone: '+256 702 855 482',
  },
  {
    name: 'Link Bus - Bundibugyo',
    company: 'Link Bus', type: 'bus_terminal', region: 'Western',
    district: 'Bundibugyo', city: 'Bundibugyo',
    address: 'Bundibugyo Town Terminal',
    phone: '+256 703 236 441',
  },
  {
    name: 'Link Bus - Bwera (Congo Border)',
    company: 'Link Bus', type: 'bus_terminal', region: 'Western',
    district: 'Kasese', city: 'Bwera',
    address: 'Mpondwe Terminal, Congo Border',
    phone: '+256 702 616 582',
  },
  {
    name: 'Link Bus - Kagadi',
    company: 'Link Bus', type: 'bus_terminal', region: 'Western',
    district: 'Kagadi', city: 'Kagadi',
    address: 'Kagadi Terminal',
    phone: '+256 781 756 957',
  },
  {
    name: 'Link Bus - Muhooro',
    company: 'Link Bus', type: 'bus_terminal', region: 'Western',
    district: 'Kikuube', city: 'Muhooro',
    address: 'Muhooro Town Stage',
    phone: '+256 779 528 532',
  },
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear all existing terminals
    const deleted = await DeliveryTerminal.deleteMany({});
    console.log(`Cleared ${deleted.deletedCount} existing terminals`);

    const inserted = await DeliveryTerminal.insertMany(TERMINALS);
    console.log(`\n✅ Seeded ${inserted.length} Link Bus Uganda terminals:\n`);

    // Group by region for display
    const byRegion = inserted.reduce((acc, t) => {
      if (!acc[t.region]) acc[t.region] = [];
      acc[t.region].push(t);
      return acc;
    }, {});

    Object.keys(byRegion).forEach(region => {
      console.log(`  ${region} Region:`);
      byRegion[region].forEach(t => console.log(`    - ${t.name} | ${t.address} | ${t.phone}`));
    });

  } catch (err) {
    console.error('❌ Seed failed:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected');
  }
}

seed();
