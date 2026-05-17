/**
 * AI Search Route
 * Handles application discovery via natural language queries
 */

const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();
const aiAuth = require('../middleware/aiAuth');
const {
  validateMessages,
  checkRateLimit,
  filterResponse,
} = require('../services/aiSecurityService');
const {
  buildSearchSystemPrompt,
  getDownloadableApps,
} = require('../services/aiContextBuilder');
const {
  searchApplications,
  getTrendingApplications,
  getCategories,
} = require('../services/aiSearchEngine');

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
 * POST /api/ai/search
 * Search for applications using natural language
 * Body: { query: string, messages?: array }
 */
router.post('/search', async (req, res) => {
  try {
    const { query } = req.body;
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

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ 
        success: false, 
        message: 'Search query is required' 
      });
    }

    if (!OPENROUTER_API_KEY) {
      return res.status(500).json({ 
        success: false, 
        message: 'AI service not configured' 
      });
    }

    // Perform search in database
    const searchResult = await searchApplications(query, aiContext);
    if (!searchResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Search failed',
        error: searchResult.error,
      });
    }

    // Format search results for AI context
    const resultsText = formatSearchResults(searchResult.results);
    
    // Build AI search system prompt
    const systemPrompt = buildSearchSystemPrompt(aiContext);
    
    // Add results to system prompt
    const enhancedSystemPrompt = systemPrompt + `\n\nSEARCH RESULTS FOR "${query}":\n${resultsText}\n\nBased on these results from our database, help the user find what they need.`;

    const chatMessages = [
      { role: 'system', content: enhancedSystemPrompt },
      {
        role: 'user',
        content: `I'm looking for: ${query}. Can you help me find the right application from the results?`
      }
    ];

    console.log(`🔍 Search query: "${query}" | Results: ${searchResult.count} | User: ${aiContext.isLoggedIn ? aiContext.userEmail : 'unlogged'}`);

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
            'X-Title': 'vettcode AI Search',
          },
          body: JSON.stringify({
            model,
            messages: prepareMessages(chatMessages, model),
            max_tokens: 3000,
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
      console.error('All models failed for search');
      return res.status(502).json({
        success: false,
        message: 'Search processing failed. Please try again.',
      });
    }

    const choice = data.choices?.[0];
    let aiReply = choice?.message?.content || null;

    if (!aiReply) {
      return res.status(502).json({ success: false, message: 'No response from search' });
    }

    aiReply = filterResponse(aiReply, aiContext.isLoggedIn);

    const responsePayload = {
      success: true,
      reply: aiReply.trim(),
      applications: searchResult.results,
      appCount: searchResult.count,
    };

    // Include downloadable apps for frontend
    const downloadableApps = getDownloadableApps(searchResult.results);
    if (downloadableApps.length > 0) {
      responsePayload.freeApps = downloadableApps.map(app => ({
        _id: app._id,
        appName: app.appName,
        isFree: true,
        canDownload: true,
      }));
    }

    res.json(responsePayload);

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Search error', 
      error: error.message 
    });
  }
});

/**
 * GET /api/ai/categories
 * Get all available application categories
 */
router.get('/categories', async (req, res) => {
  try {
    const result = await getCategories();
    if (!result.success) {
      return res.status(500).json(result);
    }
    res.json(result);
  } catch (error) {
    console.error('Categories error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching categories' 
    });
  }
});

/**
 * GET /api/ai/trending
 * Get trending/popular applications
 */
router.get('/trending', async (req, res) => {
  try {
    const aiContext = req.aiContext;
    const result = await getTrendingApplications(aiContext, 10);
    
    if (!result.success) {
      return res.status(500).json(result);
    }

    const responsePayload = {
      success: true,
      applications: result.results,
      count: result.count,
    };

    // Add login reminder if unlogged
    if (!aiContext.isLoggedIn) {
      responsePayload.message = 'Log in to unlock full details and downloads';
    }

    res.json(responsePayload);
  } catch (error) {
    console.error('Trending error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching trending applications' 
    });
  }
});

/**
 * Format search results for AI context
 */
function formatSearchResults(applications) {
  if (!applications.length) {
    return 'No applications found matching the search criteria.';
  }

  return applications.map((app, i) => {
    const price = app.isFree || app.price === 0 ? 'FREE' : `${app.currency || 'USD'} ${Number(app.price).toLocaleString()}`;
    const rating = app.rating ? `⭐ ${app.rating}/5` : 'No ratings';
    const tech = app.technologyStack?.slice(0, 2).join(', ') || 'N/A';
    
    return `${i + 1}. **${app.appName}** - ${price} | ${rating}\n   Category: ${app.appCategory} | Tech: ${tech}\n   ${app.shortDescription}`;
  }).join('\n\n');
}

module.exports = router;
