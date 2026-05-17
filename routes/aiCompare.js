/**
 * AI Comparison Route
 * Handles application comparisons and recommendations
 */

const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();
const aiAuth = require('../middleware/aiAuth');
const Application = require('../models/Application');
const {
  checkRateLimit,
  filterResponse,
} = require('../services/aiSecurityService');
const {
  isAppAccessible,
} = require('../services/aiContextBuilder');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const FREE_MODELS = [
  process.env.OPENROUTER_MODEL,
  'openrouter/auto',
  'openrouter/polaris-alpha',
  'qwen/qwen3-235b-a22b:free',
  'mistralai/mistral-7b-instruct:free',
  'openrouter/free',
].filter(Boolean);

const NO_SYSTEM_MODELS = [
  'google/gemma-3-12b-it:free', 'google/gemma-3-4b-it:free', 'google/gemma-2-9b-it:free',
];

function prepareMessages(messages, model) {
  if (!NO_SYSTEM_MODELS.includes(model)) return messages;
  var system = messages.find(function(m) { return m.role === 'system'; });
  var rest = messages.filter(function(m) { return m.role !== 'system'; });
  if (!system) return rest;
  if (rest.length === 0) return [{ role: 'user', content: system.content }];
  return [{ role: 'user', content: system.content + '\n\n' + rest[0].content }].concat(rest.slice(1));
}

// Apply AI auth middleware
router.use(aiAuth);

/**
 * POST /api/ai/compare
 * Compare multiple applications
 * Body: { applicationIds: string[], criteria?: string, messages?: array }
 */
router.post('/compare', async (req, res) => {
  try {
    const { applicationIds, criteria = '' } = req.body;
    const aiContext = req.aiContext;

    // Rate limiting
    const { allowed, remaining } = checkRateLimit(aiContext.userId);
    if (!allowed) {
      return res.status(429).json({ 
        success: false, 
        message: 'Too many requests. Please wait a moment and try again.' 
      });
    }
    res.setHeader('X-RateLimit-Remaining', remaining);

    // Validate input
    if (!Array.isArray(applicationIds) || applicationIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one application ID is required',
      });
    }

    if (applicationIds.length > 5) {
      return res.status(400).json({
        success: false,
        message: 'Cannot compare more than 5 applications at once',
      });
    }

    if (!OPENROUTER_API_KEY) {
      return res.status(500).json({ 
        success: false, 
        message: 'AI service not configured' 
      });
    }

    // Fetch applications
    const applications = await Application.find({
      _id: { $in: applicationIds },
      isDraft: false,
      isActive: true,
      verificationStatus: 'verified',
    })
      .select('appName shortDescription detailedDescription appCategory price isFree currency rating downloads technologyStack supportedPlatforms licenseType commercialUse resaleRights supportLevel')
      .populate('sellerId', 'shopName verified')
      .lean();

    if (applications.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Applications not found',
      });
    }

    // Filter applications based on user permissions
    const filteredApps = applications.map(app => {
      if (isAppAccessible(app, aiContext)) return app;
      
      // Limited info for paid apps
      return {
        _id: app._id,
        appName: app.appName,
        shortDescription: app.shortDescription,
        price: app.price,
        isFree: app.isFree,
        currency: app.currency,
        rating: app.rating,
        downloads: app.downloads,
        appCategory: app.appCategory,
        sellerId: app.sellerId,
      };
    });

    // Build comparison data for AI
    const comparisonData = formatComparisonData(filteredApps);
    
    const systemPrompt = `You are VettCode AI, an expert application comparison assistant. Your role is to help users understand the differences between applications and choose the best one for their needs.

COMPARISON REQUEST: ${criteria || 'General comparison'}

${comparisonData}

COMPARISON GUIDELINES:
- Highlight key differences clearly
- Compare pricing, features, support, and technical aspects
- Explain pros and cons for each application
- Make recommendations based on different use cases
- For free applications, emphasize they're immediately available
- For paid applications, indicate if login is needed for full details
- Never invent features or specifications not mentioned above
- Use bullet points and clear formatting

Focus on helping the user make an informed decision.`;

    const chatMessages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: criteria || 'Please compare these applications for me. What are the main differences and which would you recommend?'
      }
    ];

    console.log(`📊 Comparison: ${filteredApps.map(a => a.appName).join(' vs ')} | User: ${aiContext.isLoggedIn ? aiContext.userEmail : 'unlogged'}`);

    let data = null;
    let lastError = null;

    for (const model of FREE_MODELS) {
      let response;
      try {
        response = await fetch(OPENROUTER_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://vettcode.com',
            'X-Title': 'vettcode AI Comparison',
          },
          body: JSON.stringify({
            model,
            messages: prepareMessages(chatMessages, model),
            max_tokens: 4000,
            temperature: 0.7,
          }),
        });
      } catch (fetchErr) {
        console.error(`Fetch failed for model ${model}:`, fetchErr.message);
        lastError = fetchErr.message;
        continue;
      }

      const rawText = await response.text();

      if (response.status === 429 || response.status === 503 || response.status === 400 || response.status === 402 || response.status === 404) {
        lastError = rawText;
        continue;
      }

      if (!response.ok) {
        lastError = rawText;
        continue;
      }

      try {
        data = JSON.parse(rawText);
        break;
      } catch (parseErr) {
        lastError = rawText;
        continue;
      }
    }

    if (!data) {
      console.error('All models failed for comparison');
      return res.status(502).json({
        success: false,
        message: 'Comparison processing failed. Please try again.',
      });
    }

    const choice = data.choices?.[0];
    let aiReply = choice?.message?.content || null;

    if (!aiReply) {
      return res.status(502).json({ success: false, message: 'No response from AI' });
    }

    aiReply = filterResponse(aiReply, aiContext.isLoggedIn);

    const responsePayload = {
      success: true,
      reply: aiReply.trim(),
      applications: filteredApps.map(app => ({
        _id: app._id,
        appName: app.appName,
        price: app.price,
        isFree: app.isFree,
        currency: app.currency,
        rating: app.rating,
        downloads: app.downloads,
      })),
    };

    res.json(responsePayload);

  } catch (error) {
    console.error('Comparison error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Comparison error', 
      error: error.message 
    });
  }
});

/**
 * Format applications for comparison
 */
function formatComparisonData(applications) {
  return applications.map((app, i) => {
    const price = app.isFree || app.price === 0
      ? 'FREE'
      : `${app.currency || 'USD'} ${Number(app.price).toLocaleString()}`;
    
    const tech = app.technologyStack?.join(', ') || 'N/A';
    const platforms = app.supportedPlatforms?.join(', ') || 'N/A';
    const rating = app.rating ? `⭐ ${app.rating}/5` : 'No ratings yet';
    const downloads = app.downloads ? `${app.downloads.toLocaleString()} downloads` : 'New';

    return `${i + 1}. **${app.appName}**
   Price: ${price}
   Rating: ${rating} | ${downloads}
   Category: ${app.appCategory}
   Technology: ${tech}
   Platforms: ${platforms}
   Support: ${app.supportLevel || 'Community'}
   Commercial Use: ${app.commercialUse || 'N/A'}
   Description: ${app.shortDescription || 'N/A'}`;
  }).join('\n\n');
}

module.exports = router;
