/**
 * AI Search Engine Service
 * Handles application discovery and search via natural language
 */

const Application = require('../models/Application');
const { filterApplicationData } = require('./aiSecurityService');
const { buildOptimizedQuery, rankAndFilterApplications, truncateFieldsForAI } = require('./aiDataOptimizer');

/**
 * Search applications based on natural language query
 * Returns filtered results based on user permissions
 */
const searchApplications = async (query, aiContext = {}, filters = {}) => {
  try {
    if (!query || typeof query !== 'string') {
      return { success: false, error: 'Invalid search query' };
    }

    const {
      isLoggedIn = false,
      purchasedApplications = [],
    } = aiContext;

    // Build optimized query
    const searchQuery = buildOptimizedQuery(query, filters);

    // Perform text search with optimal limit
    let results;
    const OPTIMAL_LIMIT = 10; // Limit to prevent AI overload
    
    if (query.trim().length > 0) {
      results = await Application.find(searchQuery)
        .select('appName shortDescription appCategory price isFree currency rating downloads verificationStatus badges technologyStack supportedPlatforms')
        .populate('sellerId', 'shopName verified')
        .sort({ score: { $meta: 'textScore' }, downloads: -1, rating: -1 })
        .limit(OPTIMAL_LIMIT)
        .lean();
    } else {
      results = await Application.find(searchQuery)
        .select('appName shortDescription appCategory price isFree currency rating downloads verificationStatus badges')
        .populate('sellerId', 'shopName verified')
        .sort({ downloads: -1, rating: -1 })
        .limit(OPTIMAL_LIMIT)
        .lean();
    }

    // Rank by relevance and keep only top results
    const ranked = rankAndFilterApplications(results, query, 8);

    // Filter by user permissions and truncate fields
    const filteredResults = ranked
      .map(app => {
        const filtered = filterApplicationData(app, isLoggedIn, purchasedApplications);
        return truncateFieldsForAI(filtered, 'basic');
      })
      .filter(Boolean);

    return {
      success: true,
      results: filteredResults,
      count: filteredResults.length,
    };
  } catch (error) {
    console.error('Search error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Search applications by category
 */
const searchByCategory = async (category, aiContext = {}) => {
  try {
    const {
      isLoggedIn = false,
      purchasedApplications = [],
    } = aiContext;

    const results = await Application.find({
      appCategory: category,
      isDraft: false,
      isActive: true,
      verificationStatus: 'verified',
    })
      .select('appName shortDescription appCategory price isFree currency rating downloads verificationStatus badges')
      .populate('sellerId', 'shopName verified')
      .sort({ downloads: -1, rating: -1 })
      .limit(15)
      .lean();

    const filteredResults = results.map(app => 
      filterApplicationData(app, isLoggedIn, purchasedApplications)
    ).filter(Boolean);

    return {
      success: true,
      results: filteredResults,
      count: filteredResults.length,
    };
  } catch (error) {
    console.error('Category search error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get trending/popular applications
 */
const getTrendingApplications = async (aiContext = {}, limit = 10) => {
  try {
    const {
      isLoggedIn = false,
      purchasedApplications = [],
    } = aiContext;

    const results = await Application.find({
      isDraft: false,
      isActive: true,
      verificationStatus: 'verified',
    })
      .select('appName shortDescription appCategory price isFree currency rating downloads views verificationStatus badges')
      .populate('sellerId', 'shopName verified')
      .sort({ downloads: -1, views: -1, rating: -1 })
      .limit(limit)
      .lean();

    const filteredResults = results.map(app => 
      filterApplicationData(app, isLoggedIn, purchasedApplications)
    ).filter(Boolean);

    return {
      success: true,
      results: filteredResults,
      count: filteredResults.length,
    };
  } catch (error) {
    console.error('Trending search error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get all available categories
 */
const getCategories = async () => {
  try {
    const categories = await Application.distinct('appCategory', {
      isDraft: false,
      isActive: true,
      verificationStatus: 'verified',
    });

    return {
      success: true,
      categories: categories.sort(),
      count: categories.length,
    };
  } catch (error) {
    console.error('Get categories error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get applications by multiple criteria
 */
const advancedSearch = async (criteria = {}, aiContext = {}) => {
  try {
    const {
      isLoggedIn = false,
      purchasedApplications = [],
    } = aiContext;

    const query = {
      isDraft: false,
      isActive: true,
      verificationStatus: 'verified',
    };

    // Apply filters
    if (criteria.category) query.appCategory = criteria.category;
    if (criteria.minRating) query.rating = { $gte: criteria.minRating };
    if (criteria.tags) query.tags = { $regex: criteria.tags, $options: 'i' };

    if (criteria.freeOnly) {
      query.isFree = true;
    } else if (criteria.maxPrice !== undefined) {
      query.$or = [
        { isFree: true },
        { price: { $lte: criteria.maxPrice } }
      ];
    }

    if (criteria.technology) {
      query.technologyStack = { $in: [criteria.technology] };
    }

    if (criteria.platform) {
      query.supportedPlatforms = { $in: [criteria.platform] };
    }

    const results = await Application.find(query)
      .select('appName shortDescription appCategory price isFree currency rating downloads verificationStatus badges technologyStack supportedPlatforms')
      .populate('sellerId', 'shopName verified')
      .sort({ rating: -1, downloads: -1 })
      .limit(criteria.limit || 20)
      .lean();

    const filteredResults = results.map(app => 
      filterApplicationData(app, isLoggedIn, purchasedApplications)
    ).filter(Boolean);

    return {
      success: true,
      results: filteredResults,
      count: filteredResults.length,
    };
  } catch (error) {
    console.error('Advanced search error:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  searchApplications,
  searchByCategory,
  getTrendingApplications,
  getCategories,
  advancedSearch,
};
