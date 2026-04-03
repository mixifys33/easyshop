const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();
const Product = require('../models/Product');
const mongoose = require('mongoose');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Inline order model (same schema as orders.js)
const orderSchema = new mongoose.Schema({
  userId: String,
  sellerId: String,
  items: [{ productId: String, name: String, price: Number, quantity: Number, image: String }],
  delivery: { type: { type: String }, name: String, fee: Number, estimatedDays: String },
  paymentMethod: String,
  paymentStatus: { type: String, default: 'pending' },
  status: { type: String, default: 'pending' },
  subtotal: Number,
  deliveryFee: Number,
  customerInfo: { fullName: String, phone: String, address: String, city: String, notes: String },
  buyerInfo: { userId: String, name: String, email: String, phone: String },
}, { timestamps: true });

const CustomerOrder = mongoose.models.CustomerOrder || mongoose.model('CustomerOrder', orderSchema);

const MODELS = [
  'openrouter/auto',
  'openrouter/polaris-alpha',
  'qwen/qwen3.6-plus:free',
  'google/gemma-3-12b-it:free',
  'openrouter/free',
].filter(Boolean);

const VISION_MODELS = [
  'openrouter/auto',
  'nvidia/nemotron-nano-12b-v2-vl:free',
  'google/gemma-3-12b-it:free',
].filter(Boolean);

const PRODUCT_SELECT = 'title regularPrice salePrice category subCategory brand stock description cashOnDelivery images sellerId';

// ── Call AI with model fallback ───────────────────────────────────────────────
async function callAI(messages, models, maxTokens) {
  maxTokens = maxTokens || 500;
  var lastError = null;
  for (var i = 0; i < models.length; i++) {
    try {
      var res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + OPENROUTER_API_KEY,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://alloutgadgets.com',
          'X-Title': 'EasyShop AI',
        },
        body: JSON.stringify({ model: models[i], messages: messages, max_tokens: maxTokens, temperature: 0.2 }),
      });
      var raw = await res.text();
      if (res.status === 429 || res.status === 503) { lastError = raw; continue; }
      if (!res.ok) { lastError = raw; continue; }
      var data = JSON.parse(raw);
      var text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
      if (text) return text.trim();
    } catch (e) { lastError = e.message; }
  }
  throw new Error('All AI models failed: ' + String(lastError).slice(0, 200));
}

// ── STEP 1: Intent Router AI ──────────────────────────────────────────────────
// Returns JSON: { intent, query, userId }
async function detectIntent(userMessage, userContext) {
  var systemPrompt = 'You are an intent classifier for an e-commerce shopping assistant.\n'
    + 'Analyse the user message and return ONLY valid JSON with these fields:\n'
    + '{\n'
    + '  "intent": one of ["product_search","order_tracking","cart_action","wishlist_action","image_search","general"],\n'
    + '  "query": the core search term or product name extracted (e.g. "Samsung Galaxy S23 Ultra"),\n'
    + '  "action": for cart/wishlist: "add" or "remove" (optional),\n'
    + '  "userId": null (you do not know this)\n'
    + '}\n\n'
    + 'Rules:\n'
    + '- product_search: user asks about a product, price, availability, recommendations\n'
    + '- order_tracking: user asks about their order, delivery status, tracking\n'
    + '- cart_action: user wants to add/remove something from cart\n'
    + '- wishlist_action: user wants to add/remove something from wishlist\n'
    + '- image_search: user uploaded an image to find a product\n'
    + '- general: greetings, policy questions, how-to questions\n'
    + 'Return ONLY the JSON object, no explanation.';

  var raw = await callAI([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ], MODELS, 200);

  try {
    var m = raw.match(/\{[\s\S]*\}/);
    return JSON.parse(m ? m[0] : raw);
  } catch (_) {
    return { intent: 'general', query: userMessage };
  }
}

// ── Product DB fetch ──────────────────────────────────────────────────────────
async function fetchProducts(query, limit) {
  limit = limit || 6;
  var base = { status: 'active', isDraft: { $ne: true } };
  if (!query || !query.trim()) {
    var newest = await Product.find(Object.assign({}, base, { stock: { $gt: 0 } }))
      .select(PRODUCT_SELECT).populate('sellerId', 'shop shopName verified')
      .sort({ createdAt: -1 }).limit(limit).lean();
    return newest;
  }
  var q = query.trim();
  var exact = await Product.find(Object.assign({}, base, { title: { $regex: q, $options: 'i' } }))
    .select(PRODUCT_SELECT).populate('sellerId', 'shop shopName verified')
    .sort({ stock: -1 }).limit(Math.ceil(limit / 2)).lean();

  var broad = await Product.find(Object.assign({}, base, {
    $or: [
      { title: { $regex: q, $options: 'i' } },
      { category: { $regex: q, $options: 'i' } },
      { brand: { $regex: q, $options: 'i' } },
      { description: { $regex: q, $options: 'i' } },
    ],
  })).select(PRODUCT_SELECT).populate('sellerId', 'shop shopName verified')
    .sort({ stock: -1, salePrice: 1 }).limit(limit).lean();

  var seen = {};
  var merged = [];
  exact.concat(broad).forEach(function(p) {
    var id = p._id.toString();
    if (!seen[id]) { seen[id] = true; merged.push(p); }
  });
  return merged.slice(0, limit);
}

// ── Related products (same category, different product) ───────────────────────
async function fetchRelated(product, limit) {
  limit = limit || 5;
  var base = { status: 'active', isDraft: { $ne: true }, stock: { $gt: 0 } };
  if (product._id) base._id = { $ne: product._id };
  if (product.category) base.category = product.category;
  return Product.find(base)
    .select(PRODUCT_SELECT).populate('sellerId', 'shop shopName verified')
    .sort({ salePrice: 1 }).limit(limit).lean();
}

// ── Format product for AI context ─────────────────────────────────────────────
function formatProductForAI(p) {
  var price = p.salePrice || p.regularPrice || 0;
  var shop = (p.sellerId && p.sellerId.shop && p.sellerId.shop.shopName)
    || (p.sellerId && p.sellerId.shopName) || 'EasyShop';
  return '"' + (p.title || '') + '" | UGX ' + Number(price).toLocaleString()
    + ' | Stock: ' + (p.stock > 0 ? p.stock : 'OUT') + ' | Brand: ' + (p.brand || 'N/A')
    + ' | Category: ' + (p.category || '') + ' | Shop: ' + shop;
}

// ── Format product for frontend card ─────────────────────────────────────────
function formatProductCard(p) {
  var price = p.salePrice || p.regularPrice || 0;
  var shop = (p.sellerId && p.sellerId.shop && p.sellerId.shop.shopName)
    || (p.sellerId && p.sellerId.shopName) || 'EasyShop';
  var img = (p.images && p.images[0] && (p.images[0].url || p.images[0].thumbnailUrl)) || '';
  return {
    id: p._id ? p._id.toString() : '',
    name: p.title || '',
    price: price,
    priceFormatted: 'UGX ' + Number(price).toLocaleString(),
    category: p.category || '',
    brand: p.brand || '',
    stock: p.stock || 0,
    description: (p.description || '').slice(0, 150),
    image: img,
    shopName: shop,
    cashOnDelivery: p.cashOnDelivery || 'No',
    sellerId: (p.sellerId && p.sellerId._id) ? p.sellerId._id.toString() : (p.sellerId ? p.sellerId.toString() : ''),
  };
}

// ── Format order for AI context ───────────────────────────────────────────────
function formatOrderForAI(o) {
  var items = (o.items || []).map(function(i) { return i.name + ' x' + i.quantity; }).join(', ');
  var total = o.subtotal ? 'UGX ' + Number(o.subtotal).toLocaleString() : 'N/A';
  var date = o.createdAt ? new Date(o.createdAt).toLocaleDateString() : 'N/A';
  return 'Order #' + o._id.toString().slice(-6).toUpperCase()
    + ' | Status: ' + (o.status || 'pending').toUpperCase()
    + ' | Payment: ' + (o.paymentStatus || 'pending')
    + ' | Items: ' + (items || 'N/A')
    + ' | Total: ' + total
    + ' | Date: ' + date
    + (o.delivery && o.delivery.name ? ' | Delivery: ' + o.delivery.name + ' (' + (o.delivery.estimatedDays || '?') + ' days)' : '');
}

// ── Format order for frontend card ───────────────────────────────────────────
function formatOrderCard(o) {
  return {
    id: o._id.toString(),
    shortId: o._id.toString().slice(-6).toUpperCase(),
    status: o.status || 'pending',
    paymentStatus: o.paymentStatus || 'pending',
    paymentMethod: o.paymentMethod || '',
    items: o.items || [],
    subtotal: o.subtotal || 0,
    deliveryFee: o.deliveryFee || 0,
    delivery: o.delivery || null,
    customerInfo: o.customerInfo || null,
    createdAt: o.createdAt,
  };
}

// ── STEP 2+3: Product pipeline ────────────────────────────────────────────────
async function handleProductSearch(userMessage, intentData, conversationHistory) {
  var query = intentData.query || userMessage;
  var rawProducts = await fetchProducts(query, 6);

  // If we found a primary product, also fetch related
  var primaryProduct = rawProducts[0] || null;
  var relatedRaw = primaryProduct ? await fetchRelated(primaryProduct, 5) : [];

  // Combine: primary first, then related (deduplicated)
  var seen = {};
  var allRaw = [];
  rawProducts.concat(relatedRaw).forEach(function(p) {
    var id = p._id.toString();
    if (!seen[id]) { seen[id] = true; allRaw.push(p); }
  });

  var productContext = allRaw.length
    ? allRaw.map(formatProductForAI).join('\n')
    : '(no matching products found)';

  // AI #2: Responder
  var systemPrompt = 'You are EasyShop AI — a friendly shopping assistant for EasyShop Uganda. Prices are in UGX.\n\n'
    + 'PRODUCTS FROM OUR DATABASE:\n' + productContext + '\n\n'
    + 'RULES:\n'
    + '1. Only reference products listed above. Never invent products.\n'
    + '2. Keep your reply SHORT (2-6 sentences).\n'
    + '3. Do NOT list products in text — product cards are shown automatically below your reply.\n'
    + '4. Answer the user\'s specific question (price, availability, specs, etc.).\n'
    + '5. If no products found, say so honestly.\n'
    + '6. Be warm and helpful.';

  var history = (conversationHistory || []).slice(-6);
  var aiMessages = [{ role: 'system', content: systemPrompt }]
    .concat(history)
    .concat([{ role: 'user', content: userMessage }]);

  var reply = await callAI(aiMessages, MODELS, 400);

  // Cards: primary product first, then related
  var cards = allRaw.slice(0, 6).map(formatProductCard);

  return { reply: reply, products: cards, orders: [] };
}

// ── Order pipeline ────────────────────────────────────────────────────────────
async function handleOrderTracking(userMessage, intentData, conversationHistory, userId) {
  if (!userId) {
    return {
      reply: 'To check your orders, please log in first. Once logged in, I can pull up all your order details and tracking info.',
      products: [],
      orders: [],
    };
  }

  var orders = await CustomerOrder.find({ userId: userId }).sort({ createdAt: -1 }).limit(10).lean();

  var orderContext = orders.length
    ? orders.map(formatOrderForAI).join('\n')
    : '(no orders found for this user)';

  var systemPrompt = 'You are EasyShop AI. The user is asking about their orders.\n\n'
    + 'USER\'S ORDERS FROM DATABASE:\n' + orderContext + '\n\n'
    + 'RULES:\n'
    + '1. Answer the user\'s specific question about their orders.\n'
    + '2. Keep reply SHORT (2-5 sentences).\n'
    + '3. Do NOT list order details in text — order cards are shown automatically.\n'
    + '4. If no orders, tell them they have no orders yet.\n'
    + '5. For tracking: explain the current status clearly.';

  var history = (conversationHistory || []).slice(-4);
  var aiMessages = [{ role: 'system', content: systemPrompt }]
    .concat(history)
    .concat([{ role: 'user', content: userMessage }]);

  var reply = await callAI(aiMessages, MODELS, 350);
  var orderCards = orders.map(formatOrderCard);

  return { reply: reply, products: [], orders: orderCards };
}

// ── Cart/Wishlist pipeline ────────────────────────────────────────────────────
async function handleCartWishlistAction(userMessage, intentData, conversationHistory, intent) {
  var query = intentData.query || userMessage;
  var rawProducts = await fetchProducts(query, 4);

  var productContext = rawProducts.length
    ? rawProducts.map(formatProductForAI).join('\n')
    : '(no matching products found)';

  var actionWord = intent === 'cart_action' ? 'cart' : 'wishlist';
  var systemPrompt = 'You are EasyShop AI. The user wants to add/remove a product from their ' + actionWord + '.\n\n'
    + 'MATCHING PRODUCTS:\n' + productContext + '\n\n'
    + 'RULES:\n'
    + '1. Confirm which product you found and tell the user the action buttons are on the product cards below.\n'
    + '2. Keep reply to 1-3 sentences.\n'
    + '3. If no product found, say so and suggest they search differently.\n'
    + '4. Be friendly.';

  var history = (conversationHistory || []).slice(-4);
  var aiMessages = [{ role: 'system', content: systemPrompt }]
    .concat(history)
    .concat([{ role: 'user', content: userMessage }]);

  var reply = await callAI(aiMessages, MODELS, 250);
  var cards = rawProducts.map(formatProductCard);

  return { reply: reply, products: cards, orders: [] };
}

// ── General pipeline ──────────────────────────────────────────────────────────
async function handleGeneral(userMessage, conversationHistory) {
  var systemPrompt = 'You are EasyShop AI — a friendly shopping assistant for EasyShop Uganda.\n'
    + 'Answer general questions about shopping, delivery, payments, returns, and how to use the app.\n'
    + 'Keep replies SHORT (2-5 sentences). Be warm and helpful.';

  var history = (conversationHistory || []).slice(-6);
  var aiMessages = [{ role: 'system', content: systemPrompt }]
    .concat(history)
    .concat([{ role: 'user', content: userMessage }]);

  var reply = await callAI(aiMessages, MODELS, 350);
  return { reply: reply, products: [], orders: [] };
}

// ── POST /api/shop-ai/chat ────────────────────────────────────────────────────
router.post('/chat', async function(req, res) {
  try {
    var messages = req.body.messages || [];
    var userContext = req.body.userContext || {};

    if (!messages.length) return res.status(400).json({ error: 'messages required' });
    if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'AI not configured' });

    // Get last user message
    var lastUser = '';
    for (var i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { lastUser = messages[i].content || ''; break; }
    }
    if (!lastUser) return res.status(400).json({ error: 'No user message found' });

    // Build conversation history for context (exclude last user msg, it's sent separately)
    var conversationHistory = messages.slice(0, -1).filter(function(m) {
      return m.role && m.content && !m.loading;
    });

    console.log('[shopAI] User:', lastUser.slice(0, 80));

    // STEP 1: Detect intent
    var intentData = await detectIntent(lastUser, userContext);
    console.log('[shopAI] Intent:', intentData.intent, '| Query:', intentData.query);

    var userId = userContext.userId || null;
    var result;

    // STEP 2+3: Route to correct pipeline
    switch (intentData.intent) {
      case 'product_search':
        result = await handleProductSearch(lastUser, intentData, conversationHistory);
        break;
      case 'order_tracking':
        result = await handleOrderTracking(lastUser, intentData, conversationHistory, userId);
        break;
      case 'cart_action':
        result = await handleCartWishlistAction(lastUser, intentData, conversationHistory, 'cart_action');
        break;
      case 'wishlist_action':
        result = await handleCartWishlistAction(lastUser, intentData, conversationHistory, 'wishlist_action');
        break;
      default:
        result = await handleGeneral(lastUser, conversationHistory);
    }

    res.json({
      success: true,
      reply: result.reply,
      products: result.products || [],
      orders: result.orders || [],
      intent: intentData.intent,
    });
  } catch (e) {
    console.error('[shopAI] chat error:', e.message);
    res.status(500).json({ error: 'AI service error', detail: e.message });
  }
});

// ── POST /api/shop-ai/image-search ───────────────────────────────────────────
router.post('/image-search', async function(req, res) {
  try {
    var imageUrl = req.body.imageUrl;
    var imageBase64 = req.body.imageBase64;

    if (!imageUrl && !imageBase64) return res.status(400).json({ error: 'imageUrl or imageBase64 required' });
    if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'AI not configured' });

    var imageContent = imageUrl
      ? { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } }
      : { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + imageBase64, detail: 'high' } };

    // Vision AI: identify the product
    var identifyRaw = await callAI([{
      role: 'user',
      content: [
        imageContent,
        { type: 'text', text: 'Identify the product in this image. Respond ONLY with JSON: {"productName":"name","category":"category","brand":"brand or empty","keywords":["kw1","kw2","kw3"]}' },
      ],
    }], VISION_MODELS, 300);

    var identified = { productName: 'product', keywords: [] };
    try {
      var m = identifyRaw.match(/\{[\s\S]*\}/);
      identified = JSON.parse(m ? m[0] : identifyRaw);
    } catch (_) {}

    console.log('[shopAI] Image identified:', identified);

    var query = [identified.brand, identified.productName].concat(identified.keywords || []).filter(Boolean).join(' ');
    var rawProducts = await fetchProducts(query, 6);
    if (!rawProducts.length) rawProducts = await fetchProducts(identified.category || identified.productName || '', 6);

    var productContext = rawProducts.length
      ? rawProducts.map(formatProductForAI).join('\n')
      : '(no matching products found)';

    // Responder AI
    var systemPrompt = 'You are EasyShop AI. The user uploaded an image of a product.\n'
      + 'Identified product: ' + (identified.productName || 'unknown') + ' | Brand: ' + (identified.brand || 'unknown') + '\n\n'
      + 'MATCHING PRODUCTS IN OUR STORE:\n' + productContext + '\n\n'
      + 'Write a SHORT reply (2-4 sentences) telling the user what you identified and showing matching products below.\n'
      + 'Do NOT list products in text — cards are shown automatically.';

    var reply = await callAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'I uploaded an image to find this product.' },
    ], MODELS, 250);

    res.json({
      success: true,
      identified: identified,
      products: rawProducts.map(formatProductCard),
      orders: [],
      reply: reply,
      intent: 'image_search',
    });
  } catch (e) {
    console.error('[shopAI] image-search error:', e.message);
    res.status(500).json({ error: 'Image search failed', detail: e.message });
  }
});

// ── GET /api/shop-ai/recommendations ─────────────────────────────────────────
router.get('/recommendations', async function(req, res) {
  try {
    var category = req.query.category || '';
    var limit = parseInt(req.query.limit) || 8;
    var rawProducts = await fetchProducts(category, limit);
    res.json({ success: true, products: rawProducts.map(formatProductCard) });
  } catch (e) {
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

module.exports = router;
