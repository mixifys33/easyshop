/**
 * AI Data Optimizer Service
 * Intelligently selects and limits data sent to AI to prevent overload
 * Ensures AI only receives relevant, necessary information
 */

/**
 * Detect user intent to determine what data to fetch
 * Returns: { intent, limit, fields }
 */
const detectUserIntent = (messages) => {
  if (!messages || messages.length === 0) {
    return { intent: 'general', limit: 5, fields: 'basic' };
  }

  const lastMessage = messages[messages.length - 1];
  const text = (lastMessage.text || lastMessage.content || '').toLowerCase();

  // Detect intent patterns
  const intents = {
    compare: {
      keywords: ['compare', 'versus', 'vs', 'difference', 'better', 'which', 'alternative'],
      limit: 6,
      fields: 'comparison'
    },
    search: {
      keywords: ['find', 'looking for', 'search', 'show me', 'have you got'],
      limit: 10,
      fields: 'basic'
    },
    details: {
      keywords: ['details', 'tell me more', 'features', 'specs', 'technical', 'requirements', 'dependencies'],
      limit: 1,
      fields: 'full'
    },
    download: {
      keywords: ['download', 'install', 'get', 'acquire'],
      limit: 1,
      fields: 'download'
    },
    pricing: {
      keywords: ['price', 'cost', 'free', 'payment', 'plan', 'afford'],
      limit: 3,
      fields: 'pricing'
    },
    general: {
      keywords: [],
      limit: 5,
      fields: 'basic'
    }
  };

  for (const [intent, config] of Object.entries(intents)) {
    if (config.keywords.some(kw => text.includes(kw))) {
      return { intent, limit: config.limit, fields: config.fields };
    }
  }

  return { intent: 'general', limit: 5, fields: 'basic' };
};

/**
 * Select only necessary fields from application based on intent
 */
const selectApplicationFields = (app, fieldType = 'basic') => {
  const fieldMaps = {
    basic: ['_id', 'appName', 'shortDescription', 'price', 'isFree', 'currency', 'rating', 'downloads', 'appCategory', 'badges', 'verificationStatus'],
    comparison: ['_id', 'appName', 'shortDescription', 'price', 'isFree', 'currency', 'rating', 'downloads', 'appCategory', 'technologyStack', 'supportedPlatforms', 'supportLevel', 'licenseType'],
    full: ['_id', 'appName', 'shortDescription', 'detailedDescription', 'price', 'isFree', 'currency', 'rating', 'downloads', 'appCategory', 'subCategory', 'technologyStack', 'supportedPlatforms', 'technicalRequirements', 'dependencies', 'licenseType', 'supportLevel', 'commercialUse'],
    pricing: ['_id', 'appName', 'price', 'isFree', 'currency', 'licenseType', 'commercialUse'],
    download: ['_id', 'appName', 'isFree', 'price', 'sourceCodeFile']
  };

  const fields = fieldMaps[fieldType] || fieldMaps.basic;
  const selected = {};

  fields.forEach(field => {
    if (field in app) {
      selected[field] = app[field];
    }
  });

  return selected;
};

/**
 * Truncate and summarize long text fields for AI context
 */
const truncateFieldsForAI = (app, fieldType = 'basic') => {
  const truncated = { ...app };

  // Truncate descriptions
  if (truncated.shortDescription && truncated.shortDescription.length > 200) {
    truncated.shortDescription = truncated.shortDescription.substring(0, 200) + '...';
  }

  if (truncated.detailedDescription && truncated.detailedDescription.length > 500) {
    truncated.detailedDescription = truncated.detailedDescription.substring(0, 500) + '...';
  }

  // Limit arrays
  if (Array.isArray(truncated.technologyStack) && truncated.technologyStack.length > 5) {
    truncated.technologyStack = truncated.technologyStack.slice(0, 5);
  }

  if (Array.isArray(truncated.supportedPlatforms) && truncated.supportedPlatforms.length > 5) {
    truncated.supportedPlatforms = truncated.supportedPlatforms.slice(0, 5);
  }

  if (Array.isArray(truncated.technicalRequirements) && truncated.technicalRequirements.length > 3) {
    truncated.technicalRequirements = truncated.technicalRequirements.slice(0, 3);
  }

  if (Array.isArray(truncated.dependencies) && truncated.dependencies.length > 5) {
    truncated.dependencies = truncated.dependencies.slice(0, 5);
  }

  return truncated;
};

/**
 * Filter related applications based on relevance score
 */
const rankAndFilterApplications = (applications, userQuery, limit = 5) => {
  if (!applications || applications.length === 0) return [];
  if (applications.length <= limit) return applications;

  // Score each application based on relevance to query
  const scored = applications.map(app => {
    let score = 0;

    const query = userQuery.toLowerCase();

    // Score based on matches
    if (app.appName?.toLowerCase().includes(query)) score += 10;
    if (app.shortDescription?.toLowerCase().includes(query)) score += 5;
    if (app.tags?.toLowerCase().includes(query)) score += 3;

    // Boost by popularity
    score += (app.downloads || 0) / 1000;
    score += (app.rating || 0) * 2;

    // Boost verified apps
    if (app.verificationStatus === 'verified') score += 5;

    // Boost free apps
    if (app.isFree) score += 2;

    return { ...app, relevanceScore: score };
  });

  // Sort by relevance and take top N
  return scored
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit)
    .map(({ relevanceScore, ...app }) => app); // Remove score from result
};

/**
 * Build optimized MongoDB query based on intent
 */
const buildOptimizedQuery = (searchTerm = '', filters = {}) => {
  const baseQuery = {
    isDraft: false,
    isActive: true,
    verificationStatus: 'verified',
  };

  // Add search term
  if (searchTerm && searchTerm.trim().length > 0) {
    baseQuery.$text = { $search: searchTerm };
  }

  // Apply category filter
  if (filters.category) {
    baseQuery.appCategory = filters.category;
  }

  // Apply price filters
  if (filters.freeOnly) {
    baseQuery.isFree = true;
  } else if (filters.maxPrice !== undefined) {
    baseQuery.$or = [
      { isFree: true },
      { price: { $lte: filters.maxPrice } }
    ];
  }

  // Apply technology filter
  if (filters.technology) {
    baseQuery.technologyStack = { $in: [filters.technology] };
  }

  // Apply platform filter
  if (filters.platform) {
    baseQuery.supportedPlatforms = { $in: [filters.platform] };
  }

  // Apply rating filter
  if (filters.minRating) {
    baseQuery.rating = { $gte: filters.minRating };
  }

  return baseQuery;
};

/**
 * Paginate results to avoid overwhelming AI with data
 */
const paginateResults = (items, page = 1, pageSize = 5) => {
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  
  return {
    items: items.slice(start, end),
    total: items.length,
    page,
    pageSize,
    hasMore: end < items.length,
  };
};

/**
 * Summarize application for AI context (ultra-compact version)
 */
const summarizeForAI = (app) => {
  return {
    name: app.appName,
    price: app.isFree ? 'FREE' : `${app.currency || 'USD'} ${app.price}`,
    rating: app.rating ? `${app.rating}/5` : 'N/A',
    category: app.appCategory,
    tech: app.technologyStack?.slice(0, 2)?.join(', ') || 'N/A',
    desc: app.shortDescription?.substring(0, 100) || '',
  };
};

/**
 * Build compact related applications text for AI
 */
const buildCompactRelatedAppsContext = (applications, limit = 5) => {
  if (!applications || applications.length === 0) return '';

  const filtered = applications.slice(0, limit);
  const lines = filtered.map((app, i) => {
    const summary = summarizeForAI(app);
    return `${i + 1}. ${summary.name} (${summary.price}) - ${summary.rating} - ${summary.tech}`;
  });

  return lines.join('\n');
};

/**
 * Memory-efficient batch processing of large result sets
 */
const processBatch = async (items, batchSize = 100, processor) => {
  const results = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const processed = await processor(batch);
    results.push(...processed);
  }

  return results;
};

module.exports = {
  detectUserIntent,
  selectApplicationFields,
  truncateFieldsForAI,
  rankAndFilterApplications,
  buildOptimizedQuery,
  paginateResults,
  summarizeForAI,
  buildCompactRelatedAppsContext,
  processBatch,
};
