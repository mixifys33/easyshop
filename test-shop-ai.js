/**
 * Test script for the new shopAI backend
 * Run: node test-shop-ai.js
 */
require('dotenv').config();
const fetch = require('node-fetch');

const BASE = `http://localhost:${process.env.PORT || 3000}/api/shop-ai`;

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function get(path) {
  const res = await fetch(BASE + path);
  return res.json();
}

async function run() {
  console.log('=== ShopAI Backend Tests ===\n');

  // 1. Recommendations endpoint
  console.log('1. GET /recommendations');
  const recs = await get('/recommendations?limit=3');
  console.log('   success:', recs.success, '| products:', recs.products?.length ?? 0);
  if (recs.products?.length) {
    const p = recs.products[0];
    console.log('   sample product:', p.name, '|', p.priceFormatted, '| shop:', p.shopName);
    // Verify no sensitive fields
    const hasSensitive = JSON.stringify(p).match(/password|token|accountNumber|mtnNumber|airtelNumber/i);
    console.log('   sensitive fields exposed:', hasSensitive ? '⚠️  YES — FIX THIS' : '✅ None');
  }

  console.log('');

  // 2. General chat — product search
  console.log('2. POST /chat — product search');
  const r2 = await post('/chat', {
    messages: [{ role: 'user', content: 'Show me electronics' }],
    userContext: { userId: null, isLoggedIn: false },
  });
  console.log('   success:', r2.success, '| products:', r2.products?.length ?? 0);
  console.log('   reply preview:', (r2.reply || r2.error || '').slice(0, 100));

  console.log('');

  // 3. Chat — deals/campaigns
  console.log('3. POST /chat — deals & campaigns');
  const r3 = await post('/chat', {
    messages: [{ role: 'user', content: 'What deals and discounts are available?' }],
    userContext: { userId: null, isLoggedIn: false },
  });
  console.log('   success:', r3.success);
  console.log('   reply preview:', (r3.reply || r3.error || '').slice(0, 120));

  console.log('');

  // 4. Chat — delivery info
  console.log('4. POST /chat — delivery terminals');
  const r4 = await post('/chat', {
    messages: [{ role: 'user', content: 'How does delivery work? What are the Link Bus terminals?' }],
    userContext: { userId: null, isLoggedIn: false },
  });
  console.log('   success:', r4.success);
  console.log('   reply preview:', (r4.reply || r4.error || '').slice(0, 120));

  console.log('');

  // 5. Chat — order tracking without login
  console.log('5. POST /chat — order tracking (not logged in)');
  const r5 = await post('/chat', {
    messages: [{ role: 'user', content: 'Show me my orders' }],
    userContext: { userId: null, isLoggedIn: false },
  });
  console.log('   success:', r5.success);
  console.log('   reply preview:', (r5.reply || r5.error || '').slice(0, 120));
  console.log('   orders returned:', r5.orders?.length ?? 0, '(should be 0 — not logged in)');

  console.log('');

  // 6. Multi-turn conversation — context retention
  console.log('6. POST /chat — multi-turn context retention');
  const r6 = await post('/chat', {
    messages: [
      { role: 'user', content: 'Show me phones' },
      { role: 'assistant', content: 'Here are some phones available in our store.' },
      { role: 'user', content: 'Which one is cheapest?' },
    ],
    userContext: { userId: null, isLoggedIn: false },
  });
  console.log('   success:', r6.success, '| products:', r6.products?.length ?? 0);
  console.log('   reply preview:', (r6.reply || r6.error || '').slice(0, 120));

  console.log('');

  // 7. Verify no sensitive data in product cards
  console.log('7. Sensitive data check on product cards');
  if (r2.products?.length) {
    const productJson = JSON.stringify(r2.products);
    const sensitivePatterns = ['password', 'token', 'accountNumber', 'mtnNumber', 'airtelNumber', 'bankAccount', 'resetPassword', 'verificationToken'];
    const found = sensitivePatterns.filter(p => productJson.toLowerCase().includes(p.toLowerCase()));
    if (found.length) {
      console.log('   ⚠️  SENSITIVE FIELDS FOUND:', found.join(', '));
    } else {
      console.log('   ✅ No sensitive fields in product cards');
    }
  }

  console.log('\n=== Tests complete ===');
}

run().catch(e => {
  console.error('Test failed:', e.message);
  process.exit(1);
});
