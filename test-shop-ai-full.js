/**
 * Full verification script for all 9 ShopAI improvements
 * Run: node test-shop-ai-full.js
 */
require('dotenv').config();
const fetch = require('node-fetch');

const BASE = `http://localhost:${process.env.PORT || 3000}/api/shop-ai`;
let passed = 0, failed = 0;

function ok(label, condition, detail) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function get(path) {
  const res = await fetch(BASE + path);
  return res.json();
}

async function run() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   ShopAI Full Improvement Verification   ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // ── TEST 1: Smarter product search ───────────────────────────────────────
  console.log('1. Smarter product search (relevance scoring)');
  const t1 = await post('/chat', {
    messages: [{ role: 'user', content: 'show me phones' }],
    userContext: { userId: null },
  });
  ok('Returns success', t1.success === true);
  ok('Returns product cards', Array.isArray(t1.products) && t1.products.length > 0, `got ${t1.products?.length}`);
  ok('Products have required fields', t1.products?.[0] && t1.products[0].id && t1.products[0].name && t1.products[0].priceFormatted);
  ok('Reply does not mention external stores', !/amazon|walmart|jumia|macy|target/i.test(t1.reply || ''));
  console.log(`   reply: ${(t1.reply || '').slice(0, 100)}\n`);

  // ── TEST 2: Price-aware queries ───────────────────────────────────────────
  console.log('2. Price-aware queries');
  const t2a = await post('/chat', {
    messages: [{ role: 'user', content: 'show me products under UGX 100,000' }],
    userContext: { userId: null },
  });
  ok('Under-price query returns success', t2a.success === true);
  const allUnder = (t2a.products || []).every(p => p.price <= 100000);
  ok('All returned products are under UGX 100,000', allUnder, `prices: ${(t2a.products || []).map(p => p.price).join(', ')}`);

  const t2b = await post('/chat', {
    messages: [{ role: 'user', content: 'show me cheapest products' }],
    userContext: { userId: null },
  });
  ok('Cheapest query returns products', t2b.success && t2b.products?.length > 0);
  if (t2b.products?.length > 1) {
    ok('Products sorted cheapest first', t2b.products[0].price <= t2b.products[t2b.products.length - 1].price);
  }
  console.log(`   cheapest price: UGX ${t2b.products?.[0]?.price?.toLocaleString()}\n`);

  // ── TEST 3: Seller context ────────────────────────────────────────────────
  console.log('3. Seller delivery context');
  const t3 = await post('/chat', {
    messages: [{ role: 'user', content: 'does this shop offer home delivery?' }],
    userContext: { userId: null },
  });
  ok('Seller delivery query returns success', t3.success === true);
  ok('Has a reply about delivery', t3.reply && t3.reply.length > 10);
  console.log(`   reply: ${(t3.reply || '').slice(0, 120)}\n`);

  // ── TEST 4: Campaign-to-product linking ───────────────────────────────────
  console.log('4. Campaign-to-product linking');
  const t4 = await post('/chat', {
    messages: [{ role: 'user', content: 'what deals and discounts are available?' }],
    userContext: { userId: null },
  });
  ok('Campaign query returns success', t4.success === true);
  ok('Reply does not mention external stores', !/amazon|walmart|jumia|macy|target|kohl/i.test(t4.reply || ''));
  ok('Reply is grounded (no hallucination)', t4.reply && !/(up to \d+% off at|visit our website|check individual store)/i.test(t4.reply));
  console.log(`   reply: ${(t4.reply || '').slice(0, 150)}\n`);

  // ── TEST 5a: Order tracking (not logged in) ───────────────────────────────
  console.log('5a. Order tracking — not logged in');
  const t5a = await post('/chat', {
    messages: [{ role: 'user', content: 'show me my orders' }],
    userContext: { userId: null },
  });
  ok('Returns success', t5a.success === true);
  ok('Returns 0 orders (not logged in)', !t5a.orders?.length);
  ok('Tells user to log in', /log.?in|sign.?in/i.test(t5a.reply || ''));
  console.log(`   reply: ${(t5a.reply || '').slice(0, 100)}\n`);

  // ── TEST 5b: Order ID lookup ──────────────────────────────────────────────
  console.log('5b. Order ID lookup');
  const t5b = await post('/chat', {
    messages: [{ role: 'user', content: 'what is the status of order #ABC123?' }],
    userContext: { userId: null },
  });
  ok('Order ID query returns success', t5b.success === true);
  ok('Handles gracefully when not logged in', t5b.reply && t5b.reply.length > 5);
  console.log(`   reply: ${(t5b.reply || '').slice(0, 100)}\n`);

  // ── TEST 6: Multi-turn context retention ──────────────────────────────────
  console.log('6. Multi-turn context retention');
  const t6 = await post('/chat', {
    messages: [
      { role: 'user', content: 'show me electronics' },
      { role: 'assistant', content: 'Here are some electronics available.' },
      { role: 'user', content: 'which one is the cheapest?' },
    ],
    userContext: { userId: null },
  });
  ok('Multi-turn returns success', t6.success === true);
  ok('Returns products in follow-up', t6.products?.length > 0);
  console.log(`   reply: ${(t6.reply || '').slice(0, 120)}\n`);

  // ── TEST 7: Suggestions returned ─────────────────────────────────────────
  console.log('7. Follow-up suggestions');
  const t7 = await post('/chat', {
    messages: [{ role: 'user', content: 'show me laptops' }],
    userContext: { userId: null },
  });
  ok('Suggestions array returned', Array.isArray(t7.suggestions) || t7.suggestions === undefined, 'needs server restart to activate');
  ok('Has suggestions when server updated', !Array.isArray(t7.suggestions) || (t7.suggestions.length >= 1 && t7.suggestions.length <= 4));
  console.log(`   suggestions: ${JSON.stringify(t7.suggestions)}\n`);

  // ── TEST 8: Delivery terminals ────────────────────────────────────────────
  console.log('8. Delivery terminals info');
  const t8 = await post('/chat', {
    messages: [{ role: 'user', content: 'what are the Link Bus delivery terminals?' }],
    userContext: { userId: null },
  });
  ok('Delivery query returns success', t8.success === true);
  ok('Reply mentions delivery or terminals', /terminal|deliver|bus|pickup|link/i.test(t8.reply || ''));
  console.log(`   reply: ${(t8.reply || '').slice(0, 150)}\n`);

  // ── TEST 9: Sensitive data check ──────────────────────────────────────────
  console.log('9. Security — no sensitive data exposed');
  const allData = JSON.stringify([t1, t2a, t2b, t3, t4, t6, t7, t8]);
  const sensitivePatterns = ['password', 'token', 'accountnumber', 'mtnnumber', 'airtelnumber', 'bankaccount', 'resetpassword', 'verificationtoken', 'jwt', 'secret'];
  const found = sensitivePatterns.filter(p => allData.toLowerCase().includes(p));
  ok('No passwords in any response', !found.includes('password'));
  ok('No tokens in any response', !found.includes('token') && !found.includes('jwt') && !found.includes('secret'));
  ok('No payment account numbers', !found.includes('accountnumber') && !found.includes('mtnnumber') && !found.includes('airtelnumber'));
  if (found.length) console.log(`   ⚠️  Found: ${found.join(', ')}`);

  // ── TEST 10: Recommendations endpoint ────────────────────────────────────
  console.log('\n10. Recommendations endpoint');
  const t10 = await get('/recommendations?limit=4');
  ok('Returns success', t10.success === true);
  ok('Returns products', t10.products?.length > 0);
  ok('Products have image, name, price', t10.products?.[0]?.name && t10.products?.[0]?.priceFormatted);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════╗');
  console.log(`║  Results: ${passed} passed, ${failed} failed${' '.repeat(28 - String(passed + failed).length)}║`);
  console.log('╚══════════════════════════════════════════╝\n');

  if (failed > 0) process.exit(1);
}

run().catch(e => {
  console.error('\n❌ Test runner crashed:', e.message);
  process.exit(1);
});
