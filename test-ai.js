// Quick AI test script — run with: node test-ai.js
require('dotenv').config();
const fetch = require('node-fetch');

const KEY = process.env.OPENROUTER_API_KEY;
const BACKEND_PORT = process.env.PORT || 3000;

async function testOpenRouterDirect() {
  console.log('\n=== TEST 1: OpenRouter Key Direct ===');
  console.log('Key prefix:', KEY ? KEY.slice(0, 20) + '...' : 'MISSING');

  if (!KEY) { console.log('❌ OPENROUTER_API_KEY not set in .env'); return false; }

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + KEY,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://easyshop.com',
      'X-Title': 'EasyShop Test',
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || 'openrouter/auto',
      messages: [{ role: 'user', content: 'Say hello in one sentence.' }],
      max_tokens: 60,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    console.log('❌ OpenRouter returned', res.status, text.slice(0, 300));
    return false;
  }

  const data = JSON.parse(text);
  const reply = data.choices?.[0]?.message?.content || '(empty)';
  console.log('✅ Key works! Model:', data.model);
  console.log('   Reply:', reply);
  return true;
}

async function testBackendShopAI() {
  console.log('\n=== TEST 2: Backend /api/shop-ai/chat ===');
  const url = `http://localhost:${BACKEND_PORT}/api/shop-ai/chat`;
  console.log('Hitting:', url);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'What products do you have?' }],
      userContext: { userId: null, isLoggedIn: false, cartCount: 0 },
    }),
  }).catch(e => { console.log('❌ Could not reach backend:', e.message); return null; });

  if (!res) return false;

  const text = await res.text();
  if (!res.ok) {
    console.log('❌ Backend returned', res.status, text.slice(0, 300));
    return false;
  }

  const data = JSON.parse(text);
  console.log('✅ Backend shop-ai replied!');
  console.log('   Reply preview:', (data.reply || '').slice(0, 150));
  console.log('   Products returned:', (data.products || []).length);
  console.log('   Suggestions:', data.suggestions || []);
  return true;
}

async function testBackendProductAI() {
  console.log('\n=== TEST 3: Backend /api/ai/chat (product chat) ===');
  const url = `http://localhost:${BACKEND_PORT}/api/ai/chat`;
  console.log('Hitting:', url);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ isBot: false, text: 'What is the warranty on this?' }],
      product: {
        name: 'Samsung Galaxy S24',
        price: 2500000,
        category: 'Electronics',
        brand: 'Samsung',
        stock: 5,
        description: 'Latest Samsung flagship phone',
        cashOnDelivery: 'Yes',
        warranty: '1 year',
      },
    }),
  }).catch(e => { console.log('❌ Could not reach backend:', e.message); return null; });

  if (!res) return false;

  const text = await res.text();
  if (!res.ok) {
    console.log('❌ Backend returned', res.status, text.slice(0, 300));
    return false;
  }

  const data = JSON.parse(text);
  console.log('✅ Backend product-ai replied!');
  console.log('   Reply preview:', (data.reply || '').slice(0, 150));
  return true;
}

(async () => {
  console.log('🔍 EasyShop AI Service Test');
  console.log('============================');

  const r1 = await testOpenRouterDirect().catch(e => { console.log('❌ Error:', e.message); return false; });
  const r2 = await testBackendShopAI().catch(e => { console.log('❌ Error:', e.message); return false; });
  const r3 = await testBackendProductAI().catch(e => { console.log('❌ Error:', e.message); return false; });

  console.log('\n=== SUMMARY ===');
  console.log('OpenRouter key:', r1 ? '✅ Working' : '❌ Failed');
  console.log('Shop AI (/api/shop-ai/chat):', r2 ? '✅ Working' : '❌ Failed (is backend running?)');
  console.log('Product AI (/api/ai/chat):', r3 ? '✅ Working' : '❌ Failed (is backend running?)');
})();
