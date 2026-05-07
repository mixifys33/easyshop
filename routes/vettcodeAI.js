const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();
const mongoose = require('mongoose');
const Application = require('../models/Application');
const Seller = require('../models/Seller');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// ── Inline CustomerOrder model ──────────────────────────────────────────────
const orderSchema = new mongoose.Schema({
  userId: String, sellerId: String,
  items: [{ productId: String, applicationId: String, name: String, price: Number, quantity: Number, image: String }],
  delivery: { type: { type: String }, name: String, fee: Number, estimatedDays: String },
  paymentMethod: String,
  paymentStatus: { type: String, default: 'pending' },
  status: { type: String, default: 'pending' },
  subtotal: Number, deliveryFee: Number,
  customerInfo: { fullName: String, phone: String, address: String, city: String, notes: String },
  buyerInfo: { userId: String, name: String, email: String, phone: String },
  proofImages: [{ url: String, fileId: String, uploadedAt: Date }],
  refundDetails: { method: String, reference: String, notes: String, refundNumber: String, completedAt: Date },
}, { timestamps: true });

const CustomerOrder = mongoose.models.CustomerOrder || mongoose.model('CustomerOrder', orderSchema);

// ── Model fallback chains ───────────────────────────────────────────────────
const MODELS = [
  'openrouter/auto',
  'openrouter/polaris-alpha',
  'qwen/qwen3-235b-a22b:free',
  'mistralai/mistral-7b-instruct:free',
  'openrouter/free',
].filter(Boolean);

const VISION_MODELS = [
  'openrouter/auto',
  'meta-llama/llama-3.2-11b-vision-instruct:free',
  'mistralai/mistral-7b-instruct:free',
  'openrouter/free',
].filter(Boolean);

const NO_SYSTEM_PROMPT_MODELS = [
  'google/gemma-3-12b-it:free',
  'google/gemma-3-4b-it:free',
  'google/gemma-2-9b-it:free',
];

function prepareMessages(messages, model) {
  if (!NO_SYSTEM_PROMPT_MODELS.includes(model)) return messages;
  var system = messages.find(function(m) { return m.role === 'system'; });
  var rest = messages.filter(function(m) { return m.role !== 'system'; });
  if (!system) return rest;
  if (rest.length === 0) return [{ role: 'user', content: system.content }];
  return [{ role: 'user', content: system.content + '\n\n' + rest[0].content }].concat(rest.slice(1));
}

// ── Safe field selectors ────────────────────────────────────────────────────
const APPLICATION_SELECT = 'appName shortDescription detailedDescription price currency isFree appCategory technologyStack supportedPlatforms licenseType commercialUse verificationStatus rating reviewCount downloads views sellerId screenshots appIcon liveDemo githubRepo documentationUrl warranty supportLevel updateFrequency badges';
const SELLER_PUBLIC_SELECT = 'shop.shopName shop.shopDescription shop.businessType shop.city shop.isSetup verified metrics';

// ── Call AI with model fallback ─────────────────────────────────────────────
async function callAI(messages, models, maxTokens) {
  maxTokens = maxTokens || 3000;
  var lastError = null;
  for (var i = 0; i < models.length; i++) {
    try {
      var prepared = prepareMessages(messages, models[i]);
      var res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + OPENROUTER_API_KEY,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://vettcode.com',
          'X-Title': 'VettCode AI',
        },
        body: JSON.stringify({ model: models[i], messages: prepared, max_tokens: maxTokens, temperature: 0.25 }),
      });
      var raw = await res.text();
      if (res.status === 429 || res.status === 503 || res.status === 400 || res.status === 402 || res.status === 404) {
        lastError = raw;
        continue;
      }
      if (!res.ok) { lastError = raw; continue; }
      var data = JSON.parse(raw);
      var text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
      if (text) return text.trim();
    } catch (e) { lastError = e.message; }
  }
  throw new Error('All AI models failed: ' + String(lastError).slice(0, 200));
}

// ── Price filter parsing ────────────────────────────────────────────────────
function parsePriceFilter(text) {
  var normalised = text.replace(/(\d)[\s,](\d)/g, '$1$2');
  var under = normalised.match(/(?:under|below|less than|max|maximum|at most|up to)\s*(?:usd\s*|\$\s*)?(\d+)/i);
  var over  = normalised.match(/(?:above|over|more than|min|minimum|at least|from)\s*(?:usd\s*|\$\s*)?(\d+)/i);
  var budget = /\b(cheap|cheapest|affordable|budget|low.?price|inexpensive|free)\b/i.test(text);
  return {
    maxPrice: under ? parseInt(under[1]) : null,
    minPrice: over  ? parseInt(over[1])  : null,
    sortCheapest: budget || !!under,
    onlyFree: /\b(free|no cost|zero cost)\b/i.test(text)
  };
}

// ── Fetch applications with smart search ────────────────────────────────────
async function fetchApplications(query, limit, priceFilter) {
  limit = limit || 6;
  var base = { verificationStatus: 'verified', isActive: true, isDraft: false };

  // Apply price filter
  if (priceFilter) {
    if (priceFilter.onlyFree) {
      base.isFree = true;
    } else if (priceFilter.maxPrice || priceFilter.minPrice) {
      var priceQ = {};
      if (priceFilter.maxPrice) priceQ.$lte = priceFilter.maxPrice;
      if (priceFilter.minPrice) priceQ.$gte = priceFilter.minPrice;
      base.price = priceQ;
    }
  }

  var sortOrder = (priceFilter && priceFilter.sortCheapest)
    ? { price: 1, downloads: -1 }
    : { downloads: -1, rating: -1, createdAt: -1 };

  if (!query || !query.trim()) {
    return Application.find(base)
      .select(APPLICATION_SELECT).populate('sellerId', SELLER_PUBLIC_SELECT)
      .sort(sortOrder).limit(limit).lean();
  }

  var q = query.trim();

  // Exact name matches first
  var exact = await Application.find(Object.assign({}, base, { appName: { $regex: q, $options: 'i' } }))
    .select(APPLICATION_SELECT).populate('sellerId', SELLER_PUBLIC_SELECT)
    .sort(sortOrder).limit(Math.ceil(limit / 2)).lean();

  // Broad search
  var broad = await Application.find(Object.assign({}, base, {
    $or: [
      { appName: { $regex: q, $options: 'i' } },
      { appCategory: { $regex: q, $options: 'i' } },
      { shortDescription: { $regex: q, $options: 'i' } },
      { detailedDescription: { $regex: q, $options: 'i' } },
      { tags: { $regex: q, $options: 'i' } },
      { technologyStack: { $regex: q, $options: 'i' } },
    ],
  })).select(APPLICATION_SELECT).populate('sellerId', SELLER_PUBLIC_SELECT)
    .sort(sortOrder).limit(limit).lean();

  // Deduplicate
  var seen = {}, merged = [];
  exact.concat(broad).forEach(function(a) {
    var id = a._id.toString();
    if (!seen[id]) { seen[id] = true; merged.push(a); }
  });
  return merged.slice(0, limit);
}

// ── Order helpers ───────────────────────────────────────────────────────────
function extractOrderId(text) {
  var m = text.match(/(?:#|order\s*(?:id|#|number)?\s*)([a-f0-9]{6,24})/i);
  return m ? m[1] : null;
}

async function fetchUserOrders(userId) {
  if (!userId) return [];
  return CustomerOrder.find({ userId: userId }).sort({ createdAt: -1 }).limit(15).lean();
}

async function fetchOrderById(orderId, userId) {
  if (!orderId) return null;
  try {
    var order = null;
    if (mongoose.Types.ObjectId.isValid(orderId)) {
      order = await CustomerOrder.findById(orderId).lean();
    }
    if (!order) {
      var orders = await CustomerOrder.find({ userId: userId }).sort({ createdAt: -1 }).limit(50).lean();
      order = orders.find(function(o) {
        return o._id.toString().slice(-6).toUpperCase() === orderId.toUpperCase();
      }) || null;
    }
    if (order && userId && order.userId !== userId) return null;
    return order;
  } catch (_) { return null; }
}

async function fetchCategories() {
  return Application.distinct('appCategory', { verificationStatus: 'verified', isActive: true, isDraft: false });
}

// ── Format helpers ──────────────────────────────────────────────────────────
function getSellerName(sellerId) {
  if (!sellerId) return 'VettCode';
  if (typeof sellerId === 'object') {
    return (sellerId.shop && sellerId.shop.shopName) || sellerId.shopName || 'VettCode';
  }
  return 'VettCode';
}

function formatApplicationForAI(app) {
  var price = app.isFree ? 'FREE' : (app.currency || 'USD') + ' ' + Number(app.price || 0).toLocaleString();
  var seller = getSellerName(app.sellerId);
  var tech = (app.technologyStack || []).join(', ');
  var platforms = (app.supportedPlatforms || []).join(', ');
  
  return '"' + (app.appName || '') + '"'
    + ' | Price: ' + price
    + ' | Category: ' + (app.appCategory || 'N/A')
    + ' | Tech Stack: ' + (tech || 'N/A')
    + ' | Platforms: ' + (platforms || 'N/A')
    + ' | License: ' + (app.licenseType || 'N/A')
    + ' | Commercial Use: ' + (app.commercialUse || 'N/A')
    + ' | Rating: ' + (app.rating || 5) + '/5 (' + (app.reviewCount || 0) + ' reviews)'
    + ' | Downloads: ' + (app.downloads || 0)
    + ' | Views: ' + (app.views || 0)
    + ' | Seller: ' + seller
    + ' | Status: ' + (app.verificationStatus || 'pending')
    + (app.liveDemo ? ' | Demo: Available' : '')
    + (app.githubRepo ? ' | GitHub: Available' : '')
    + (app.documentationUrl ? ' | Docs: Available' : '');
}

function formatApplicationCard(app) {
  var price = app.price || 0;
  var img = (app.screenshots && app.screenshots[0] && app.screenshots[0].url) || 
            (app.appIcon && app.appIcon.url) || '';
  
  return {
    id: app._id ? app._id.toString() : '',
    name: app.appName || '',
    title: app.appName || '',
    slug: app.slug || app._id.toString(),
    price: price,
    isFree: app.isFree || false,
    priceFormatted: app.isFree ? 'FREE' : (app.currency || 'USD') + ' ' + Number(price).toLocaleString(),
    category: app.appCategory || '',
    shortDescription: app.shortDescription || '',
    technologyStack: app.technologyStack || [],
    platforms: app.supportedPlatforms || [],
    rating: app.rating || 5,
    reviewCount: app.reviewCount || 0,
    downloads: app.downloads || 0,
    views: app.views || 0,
    image: img,
    sellerName: getSellerName(app.sellerId),
    sellerId: app.sellerId ? (app.sellerId._id || app.sellerId).toString() : '',
    licenseType: app.licenseType || '',
    commercialUse: app.commercialUse || 'Yes',
    verificationStatus: app.verificationStatus || 'pending',
    liveDemo: app.liveDemo || '',
    githubRepo: app.githubRepo || '',
    badges: app.badges || [],
  };
}

function formatOrderForAI(o) {
  var items = (o.items || []).map(function(i) {
    return i.name + ' x' + i.quantity + ' @ USD ' + Number(i.price || 0).toLocaleString();
  }).join(', ');
  var total = o.subtotal ? 'USD ' + Number(o.subtotal).toLocaleString() : 'N/A';
  var date = o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A';
  
  return 'Order #' + o._id.toString().slice(-6).toUpperCase()
    + ' | Status: ' + (o.status || 'pending').toUpperCase()
    + ' | Payment: ' + (o.paymentStatus || 'pending') + ' via ' + (o.paymentMethod || 'N/A')
    + ' | Items: ' + (items || 'N/A')
    + ' | Total: ' + total
    + ' | Date: ' + date;
}

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
    createdAt: o.createdAt,
  };
}

// ── Topic detection ─────────────────────────────────────────────────────────
function detectTopics(messages) {
  var allText = messages.map(function(m) { return (m.content || '').toLowerCase(); }).join(' ');
  var lastUser = '';
  for (var i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') { lastUser = (messages[i].content || '').toLowerCase(); break; }
  }
  return {
    wantsOrders:       /\b(order|orders|my order|my purchase|purchase history|track|tracking|status|bought|placed|download history|my downloads|what did i buy|what have i purchased)\b/.test(allText),
    wantsApplications: /\b(app|application|applications|find|search|show|looking for|buy|price|cost|available|download|code|source|github|demo|recommend|similar|compare|alternative|sell|selling|have you got|do you have|web app|mobile app|saas|api|dashboard|template|plugin|library|tool|trending|popular|best)\b/.test(allText),
    wantsCategories:   /\b(categor|categories|types|kinds|what do you sell|what apps|browse|section)\b/.test(allText),
    wantsSeller:       /\b(seller|developer|shop|store|vendor|who sells|who made|verified|creator)\b/.test(allText),
    wantsCompare:      /\b(compare|comparison|versus|vs|difference|which is better|side by side)\b/.test(allText),
    wantsTrending:     /\b(trending|popular|hot|top rated|most downloaded|best selling|what's hot|what's popular)\b/.test(allText),
    wantsSupport:      /\b(help|support|issue|problem|can't|cannot|not working|error|assistance|guide|how to|how do i)\b/.test(allText),
    specificOrderId: extractOrderId(lastUser),
    lastUserText: lastUser,
    allText: allText,
  };
}

function extractSearchQuery(lastUserText) {
  return lastUserText
    .replace(/show me|find me|i want|i need|looking for|do you have|search for|can you find|what about|tell me about|give me|get me|display|list/gi, '')
    .replace(/\b(app|apps|application|applications|code|software|tool|tools)\b/gi, '')
    .replace(/\b(please|thanks|thank you|okay|ok)\b/gi, '')
    .replace(/\b(under|below|above|over|less than|more than|max|min|cheapest|affordable|budget|free)\s*(?:usd\s*|\$\s*)?\d[\d,]*/gi, '')
    .trim()
    .slice(0, 100);
}

// ── Build suggestions ───────────────────────────────────────────────────────
function buildSuggestions(topics, hasApps, hasOrders) {
  var chips = [];
  if (hasApps) {
    chips.push('Show free applications');
    chips.push('Which has live demo?');
    chips.push('Compare these apps');
  }
  if (hasOrders) {
    chips.push('What does this status mean?');
    chips.push('How do I download my purchase?');
  }
  if (!hasApps && !hasOrders) {
    chips.push('Show me trending apps');
    chips.push('Find React applications');
    chips.push('Show my orders');
  }
  return chips.slice(0, 4);
}

// ── Build system context ────────────────────────────────────────────────────
async function buildSystemContext(messages, userId) {
  var topics = detectTopics(messages);
  var contextParts = [];
  var applicationCards = [];
  var orderCards = [];

  // Add user context at the beginning
  if (userId) {
    contextParts.push('USER IS LOGGED IN: User ID = ' + userId);
    contextParts.push('You have access to this user\'s purchase history, orders, and downloads. Use this information to provide personalized help.');
  } else {
    contextParts.push('USER IS NOT LOGGED IN: User is browsing anonymously.');
    contextParts.push('If they ask about purchases, orders, or downloads, politely ask them to log in first.');
  }

  var categories = await fetchCategories().catch(function() { return []; });
  contextParts.push('\nAVAILABLE CATEGORIES: ' + (categories.length
    ? categories.join(', ')
    : 'Web Application, Mobile App, Desktop Application, API/Backend Service, Dashboard, E-commerce Solution'));

  if (topics.wantsApplications || topics.wantsSeller || topics.wantsTrending || topics.wantsCompare) {
    var priceFilter = parsePriceFilter(topics.lastUserText);
    var query = extractSearchQuery(topics.lastUserText);
    
    // For trending queries, fetch more apps sorted by downloads
    var limit = topics.wantsTrending ? 12 : (topics.wantsCompare ? 8 : 6);
    var rawApps = await fetchApplications(query, limit, priceFilter).catch(function() { return []; });

    if (!rawApps.length && query) {
      rawApps = await fetchApplications('', limit, priceFilter).catch(function() { return []; });
    }

    if (rawApps.length) {
      var contextLabel = topics.wantsTrending 
        ? '\nTRENDING APPLICATIONS (sorted by downloads and popularity):\n'
        : topics.wantsCompare
        ? '\nAPPLICATIONS FOR COMPARISON:\n'
        : '\nMATCHING APPLICATIONS FROM VETTCODE DATABASE:\n';
      
      contextParts.push(contextLabel + rawApps.map(formatApplicationForAI).join('\n'));
      applicationCards = rawApps.map(formatApplicationCard);
      
      if (topics.wantsCompare && rawApps.length >= 2) {
        contextParts.push('\nCOMPARISON INSTRUCTIONS: Show these applications side-by-side, highlighting key differences in price, tech stack, features, ratings, and downloads.');
      }
    } else {
      contextParts.push('\nAPPLICATIONS: No applications found matching this query in the database.');
    }
  }

  if (topics.specificOrderId && userId) {
    var specificOrder = await fetchOrderById(topics.specificOrderId, userId).catch(function() { return null; });
    if (specificOrder) {
      contextParts.push('\nSPECIFIC ORDER REQUESTED:\n' + formatOrderForAI(specificOrder));
      orderCards = [formatOrderCard(specificOrder)];
    }
  }

  if (topics.wantsOrders && userId && !orderCards.length) {
    var orders = await fetchUserOrders(userId).catch(function() { return []; });
    if (orders.length) {
      contextParts.push('\nUSER\'S ORDERS (most recent first):\n' + orders.map(formatOrderForAI).join('\n'));
      orderCards = orders.map(formatOrderCard);
    } else {
      contextParts.push('\nUSER\'S ORDERS: No orders found for this user yet.');
    }
  } else if (topics.wantsOrders && !userId) {
    contextParts.push('\nUSER\'S ORDERS: User is not logged in – cannot fetch orders. Ask them to log in.');
  }

  var suggestions = buildSuggestions(topics, applicationCards.length > 0, orderCards.length > 0);

  return { contextParts: contextParts, applicationCards: applicationCards, orderCards: orderCards, suggestions: suggestions };
}

// ── System prompt ───────────────────────────────────────────────────────────
var BASE_SYSTEM_PROMPT = `You are VettCode AI – the intelligent assistant for VettCode marketplace.
You ONLY know about VettCode platform. You help developers discover production-ready applications, compare code solutions, and make informed purchasing decisions. You NEVER answer in table format. When data needs to be structured, use nested bulleted lists, bold text for headers, and paragraphs.

CRITICAL RULES – NEVER BREAK THESE:
1. ONLY use data from the DATABASE section below. If something is not listed there, it does not exist.
2. NEVER mention any external marketplace (no GitHub Marketplace, CodeCanyon, etc.) in a negative way – focus on VettCode's strengths.
3. NEVER invent application data, prices, features, or order details. Only use what is in the data.
4. CHECK USER LOGIN STATUS in the database context. If user is logged in, you can access their orders and provide personalized help. If not logged in, politely ask them to log in for personalized features.
5. Prices are in USD unless otherwise specified.
6. Never mention passwords, payment credentials, tokens, or any sensitive data.
7. Handle ALL topics naturally in one conversation – applications, orders, downloads, tech stacks, categories.
8. When showing applications, mention key facts (price, tech stack, rating, downloads) briefly.
9. For order/purchase status questions, explain what the status means in plain language.
10. Emphasize verified applications, quality code, and developer-friendly features.
11. When user asks about their purchases/downloads and they ARE logged in, show their actual order history from the database.
12. When user asks about their purchases/downloads and they ARE NOT logged in, ask them to log in to access personalized features.
13. Be proactive - if you see orders in the database for a logged-in user, mention them when relevant.
14. For "trending" queries, show applications sorted by downloads and recent activity.
15. For "compare" queries, show multiple applications side-by-side with their key differences.
16. For "support" queries with logged-in users, check their order history first and provide specific help.`;


// ── POST /api/vettcode-ai/chat ──────────────────────────────────────────────
router.post('/chat', async function(req, res) {
  try {
    var messages = req.body.messages || [];
    var userContext = req.body.userContext || {};

    if (!messages.length) return res.status(400).json({ error: 'messages required' });
    if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'AI not configured' });

    var userId = userContext.userId || null;
    var dbContext = await buildSystemContext(messages, userId);

    var systemPrompt = BASE_SYSTEM_PROMPT
      + '\n\n=== LIVE DATA FROM VETTCODE DATABASE (USE ONLY THIS) ===\n'
      + dbContext.contextParts.join('\n')
      + '\n=== END OF DATABASE DATA – DO NOT USE ANY OTHER SOURCE ===';

    var cleanHistory = messages.filter(function(m) {
      return m.role && m.content && !m.loading;
    }).slice(-14);

    var aiMessages = [{ role: 'system', content: systemPrompt }].concat(cleanHistory);

    console.log('[vettcodeAI] userId:', userId, '| msgs:', cleanHistory.length,
      '| apps:', dbContext.applicationCards.length, '| orders:', dbContext.orderCards.length);

    var reply = await callAI(aiMessages, MODELS, 3000);

    res.json({
      success: true,
      reply: reply,
      products: dbContext.applicationCards, // Keep as 'products' for frontend compatibility
      productRecommendations: dbContext.applicationCards,
      orders: dbContext.orderCards,
      suggestions: dbContext.suggestions,
    });
  } catch (e) {
    console.error('[vettcodeAI] chat error:', e.message);
    res.status(500).json({ error: 'AI service error', detail: e.message });
  }
});

// ── POST /api/vettcode-ai/image-search ──────────────────────────────────────
router.post('/image-search', async function(req, res) {
  try {
    var imageUrl = req.body.imageUrl;
    var imageBase64 = req.body.imageBase64;

    if (!imageUrl && !imageBase64) return res.status(400).json({ error: 'imageUrl or imageBase64 required' });
    if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'AI not configured' });

    var imageContent = imageUrl
      ? { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } }
      : { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + imageBase64, detail: 'high' } };

    var identifyRaw = await callAI([{
      role: 'user',
      content: [
        imageContent,
        { type: 'text', text: 'Identify the application or software in this image. Respond ONLY with JSON: {"appName":"name","category":"category","techStack":["tech1","tech2"],"keywords":["kw1","kw2"]}' },
      ],
    }], VISION_MODELS, 300);

    var identified = { appName: 'application', keywords: [] };
    try {
      var m = identifyRaw.match(/\{[\s\S]*\}/);
      identified = JSON.parse(m ? m[0] : identifyRaw);
    } catch (_) {}

    console.log('[vettcodeAI] Image identified:', identified);

    var query = [identified.appName].concat(identified.techStack || [], identified.keywords || []).filter(Boolean).join(' ');
    var rawApps = await fetchApplications(query, 6);
    if (!rawApps.length) rawApps = await fetchApplications(identified.category || identified.appName || '', 6);

    var appContext = rawApps.length
      ? rawApps.map(formatApplicationForAI).join('\n')
      : '(no matching applications found in VettCode database)';

    var systemPrompt = 'You are VettCode AI. The user uploaded an image.\n'
      + 'Identified: ' + (identified.appName || 'unknown') + ' | Tech: ' + ((identified.techStack || []).join(', ') || 'unknown') + '\n\n'
      + 'MATCHING APPLICATIONS IN VETTCODE:\n' + appContext + '\n\n'
      + 'ONLY reference applications listed above. Never mention other marketplaces.';

    var reply = await callAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'I uploaded an image to find this application.' },
    ], MODELS, 200);

    res.json({
      success: true,
      identified: identified,
      products: rawApps.map(formatApplicationCard),
      orders: [],
      reply: reply,
      suggestions: ['Show similar apps', 'What is the price?', 'View live demo'],
    });
  } catch (e) {
    console.error('[vettcodeAI] image-search error:', e.message);
    res.status(500).json({ error: 'Image search failed', detail: e.message });
  }
});

// ── GET /api/vettcode-ai/recommendations ────────────────────────────────────
router.get('/recommendations', async function(req, res) {
  try {
    var category = req.query.category || '';
    var limit = parseInt(req.query.limit) || 8;
    var rawApps = await fetchApplications(category, limit);
    res.json({ success: true, products: rawApps.map(formatApplicationCard) });
  } catch (e) {
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

module.exports = router;
