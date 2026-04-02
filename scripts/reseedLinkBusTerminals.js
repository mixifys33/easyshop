require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const DeliveryTerminal = require('../models/DeliveryTerminal');

// Official Link Bus Uganda terminals with real contact numbers and addresses
// Grouped by region. Source: Link Bus official terminal list.
const TERMINALS = [

  // ── CENTRAL REGION ────────────────────────────────────────────────────────
  {
    name: 'Link Bus - Kampala (Katwe)',
    company: 'Link Bus', type: 'bus_terminal',
    region: 'Central', district: 'Kampala', city: 'Kampala',
    address: 'Kampala Bus Terminal, Solar House, Katwe',
    phone: '+256 751 206 424', active: true
  },
  {
    name: 'Link Bus - Busega Stage',
    company: 'Link Bus', type: 'bus_terminal',
    region: 'Central', district: 'Wakiso', city: 'Busega',
    address: 'Busega Stage, Wakiso',
    phone: '+256 751 206 424', active: true
  },
  {
    name: 'Link Bus - Mityana',
    company: 'Link Bus', type: 'bus_terminal',
    region: 'Central', district: 'Mityana', city: 'Mityana',
    address: 'Mityana Bus Terminal',
    phone: '+256 751 206 424', active: true
  },
  {
    name: 'Link Bus - Mubende',
    company: 'Link Bus', type: 'bus_terminal',
    region: 'Central', district: 'Mubende', city: 'Mubende',
    address: 'Mubende Bus Terminal',
    phone: '+256 751 206 424', active: true
  },
  {
    name: 'Link Bus - Kiboga',
    company: 'Link Bus', type: 'bus_terminal',
    region: 'Central', district: 'Kiboga', city: 'Kiboga',
    address: 'Kiboga Bus Terminal',
    phone: '+256 751 206 424', active: true
  },

  // ── WESTERN REGION ────────────────────────────────────────────────────────
  {
    name: 'Link Bus - Fort Portal',
    company: 'Link Bus', type: 'bus_terminal',
    region: 'Western', district: 'Kabarole', city: 'Fort Portal',
    address: 'Kamuhigi Road, Tooro Kingdom Gateway, Fort Portal',
    phone: '+256 701 966 181', active: true
  },
  {
    name: 'Link Bus - Kasese',
    company: 'Link Bus', type: 'bus_terminal',
    region: 'Western', district: 'Kasese', city: 'Kasese',
    address: 'Kasese Bus Terminal',
    phone: '+256 701 548 686', active: true
  },
  {
    name: 'Link Bus - Bwera (Congo Border)',
    company: 'Link Bus', type: 'bus_terminal',
    region: 'Western', district: 'Kasese', city: 'Bwera',
    address: 'Bwera/Mpondwe Terminal, Congo Border',
    phone: '+256 702 616 582', active: true
  },
  {
    name: 'Link Bus - Bundibugyo',
    company: 'Link Bus', type: 'bus_terminal',
    region: 'Western', district: 'Bundibugyo', city: 'Bundibugyo',
    address: 'Bundibugyo Terminal, West of Rwenzori',
    phone: '+256 703 236 441', active: true
  },
  {
    name: 'Link Bus - Kyenjojo',
    company: 'Link Bus', type: 'bus_terminal',
    region: 'Western', district: 'Kyenjojo', city: 'Kyenjojo',
    address: 'Kyenjojo Bus Terminal',
    phone: '+256 701 966 181', active: true
  },
  {
    name: 'Link Bus - Hoima',
    company: 'Link Bus', type: 'bus_terminal',
    region: 'Western', district: 'Hoima', city: 'Hoima',
    address: 'Hoima Bus Terminal',
    phone: '+256 757 222 743', active: true
  },
  {
    name: 'Link Bus - Masindi',
    company: 'Link Bus', type: 'bus_terminal',
    region: 'Western', district: 'Masindi', city: 'Masindi',
    address: 'Masindi Bus Terminal',
    phone: '+256 702 855 482', active: true
  },
  {
    name: 'Link Bus - Kabango',
    company: 'Link Bus', type: 'bus_terminal',
    region: 'Western', district: 'Hoima', city: 'Kabango',
    address: 'Kabango, Hoima District',
    phone: '+256 757 222 743', active: true
  },
  {
    name: 'Link Bus - Muhooro',
    company: 'Link Bus', type: 'bus_terminal',
    region: 'Western', district: 'Kikuube', city: 'Muhooro',
    address: 'Muhooro, Kikuube District',
    phone: '+256 757 222 743', active: true
  },
  {
    name: 'Link Bus - Wanseko',
    company: 'Link Bus', type: 'bus_terminal',
    region: 'Western', district: 'Buliisa', city: 'Wanseko',
    address: 'Wanseko, Buliisa District',
    phone: '+256 702 855 482', active: true
  },
  {
    name: 'Link Bus - Kafu Junction',
    company: 'Link Bus', type: 'bus_terminal',
    region: 'Western', district: 'Kiryandongo', city: 'Kafu',
    address: 'Kafu Junction, Kiryandongo',
    phone: '+256 702 855 482', active: true
  },
  {
    name: 'Link Bus - Mbarara',
    company: 'Link Bus', type: 'bus_terminal',
    region: 'Western', district: 'Mbarara', city: 'Mbarara',
    address: 'Mbarara Bus Terminal',
    phone: '+256 751 206 424', active: true
  },
  {
    name: 'Link Bus - Kabale',
    company: 'Link Bus', type: 'bus_terminal',
    region: 'Western', district: 'Kabale', city: 'Kabale',
    address: 'Kabale Bus Terminal',
    phone: '+256 751 206 424', active: true
  },

  // ── NORTHERN REGION ───────────────────────────────────────────────────────
  {
    name: 'Link Bus - Gulu',
    company: 'Link Bus', type: 'bus_terminal',
    region: 'Northern', district: 'Gulu', city: 'Gulu',
    address: 'Gulu Bus Terminal',
    phone: '+256 751 206 424', active: true
  },
  {
    name: 'Link Bus - Arua',
    company: 'Link Bus', type: 'bus_terminal',
    region: 'Northern', district: 'Arua', city: 'Arua',
    address: 'Arua Bus Terminal',
    phone: '+256 751 206 424', active: true
  },
  {
    name: 'Link Bus - Bweyale',
    company: 'Link Bus', type: 'bus_terminal',
    region: 'Northern', district: 'Kiryandongo', city: 'Bweyale',
    address: 'Bweyale, Kiryandongo',
    phone: '+256 751 206 424', active: true
  },
];

async function reseed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const deleted = await DeliveryTerminal.deleteMany({});
    console.log(`Cleared ${deleted.deletedCount} old terminals`);

    const inserted = await DeliveryTerminal.insertMany(TERMINALS);
    console.log(`\n✅ Inserted ${inserted.length} Link Bus terminals:\n`);

    const byRegion = {};
    inserted.forEach(t => {
      if (!byRegion[t.region]) byRegion[t.region] = [];
      byRegion[t.region].push(t);
    });

    Object.keys(byRegion).forEach(region => {
      console.log(`\n── ${region} Region ──`);
      byRegion[region].forEach(t => {
        console.log(`  ${t.name}`);
        console.log(`    ${t.address}`);
        console.log(`    ${t.phone}`);
      });
    });

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('\nDone.');
  }
}

reseed();
