/**
 * AI Security Service
 * Handles prompt injection protection, input sanitization, and response filtering
 */

// Keywords that might indicate prompt injection attempts
const INJECTION_PATTERNS = [
  /ignore.*previous.*instruction/i,
  /forget.*everything/i,
  /system.*prompt/i,
  /you.*are.*now/i,
  /disregard.*instructions/i,
  /pretend.*you.*are/i,
  /roleplay.*as/i,
  /act.*as.*if/i,
  /new.*instruction/i,
  /override/i,
  /jailbreak/i,
  /bypass.*security/i,
  /reveal.*secret/i,
  /show.*me.*hidden/i,
];

// Dangerous API access patterns
const DANGEROUS_PATTERNS = [
  /sql.*injection/i,
  /mongodb.*injection/i,
  /\.\.\/\.\./,
  /admin.*panel/i,
  /database.*password/i,
  /api.*key/i,
  /secret.*key/i,
  /bearer.*token/i,
];

/**
 * Check if input contains prompt injection attempts
 */
const detectPromptInjection = (input) => {
  if (!input || typeof input !== 'string') return false;
  
  const lowerInput = input.toLowerCase();
  
  // Check for injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(lowerInput)) {
      return true;
    }
  }
  
  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(lowerInput)) {
      return true;
    }
  }
  
  // Check for excessive repeated characters (obfuscation attempt)
  if (/(.)\1{10,}/.test(input)) {
    return true;
  }
  
  return false;
};

/**
 * Sanitize user input to prevent injection
 */
const sanitizeInput = (input) => {
  if (!input || typeof input !== 'string') return '';
  
  // Remove control characters
  let sanitized = input.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
  
  // Escape special characters but keep readability
  sanitized = sanitized
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
  
  // Trim excessive whitespace
  sanitized = sanitized.replace(/\s{4,}/g, ' ').trim();
  
  // Limit length
  if (sanitized.length > 5000) {
    sanitized = sanitized.substring(0, 5000);
  }
  
  return sanitized;
};

/**
 * Validate application query to prevent unauthorized data access
 */
const validateApplicationQuery = (query, isLoggedIn) => {
  if (!query || typeof query !== 'string') {
    return { valid: false, reason: 'Invalid query format' };
  }
  
  const queries = [query];
  if (Array.isArray(query)) {
    queries.push(...query);
  }
  
  // Check for attempts to access sensitive fields
  const dangerousFields = ['password', 'email', 'adminNotes', 'sellerId', 'verificationNotes'];
  for (const field of dangerousFields) {
    for (const q of queries) {
      if (typeof q === 'string' && q.toLowerCase().includes(field)) {
        return { valid: false, reason: `Cannot query ${field}` };
      }
    }
  }
  
  return { valid: true };
};

/**
 * Filter application data based on user permissions
 */
const filterApplicationData = (application, isLoggedIn, userPurchasedApps = []) => {
  if (!application) return null;
  
  const isFree = application.isFree || application.price === 0;
  const userHasAccess = isLoggedIn && (isFree || userPurchasedApps.includes(String(application._id)));
  
  // For free apps or purchased apps, return full data
  if (isFree || userHasAccess) {
    return application;
  }
  
  // For paid apps that user hasn't purchased, limit data
  const filtered = {
    _id: application._id,
    appName: application.appName,
    shortDescription: application.shortDescription,
    price: application.price,
    currency: application.currency,
    isFree: application.isFree,
    appCategory: application.appCategory,
    rating: application.rating,
    downloads: application.downloads,
    badges: application.badges,
    verificationStatus: application.verificationStatus,
    sellerId: application.sellerId,
    // Don't include: detailedDescription, dependencies, technicalRequirements, sourceCodeFile
  };
  
  return filtered;
};

/**
 * Build safety reminder for unlogged users
 */
const buildLoginReminder = () => {
  return `\n\n---\n📝 **Note:** You're currently browsing as a guest. To get full access to application details, comparisons, downloads, and personalized recommendations, please **log in or sign up** on VETTCODE. It's free!`;
};

/**
 * Validate messages array
 */
const validateMessages = (messages) => {
  if (!Array.isArray(messages)) {
    return { valid: false, reason: 'Messages must be an array' };
  }
  
  if (messages.length === 0) {
    return { valid: false, reason: 'Messages array cannot be empty' };
  }
  
  // Check each message
  for (const msg of messages) {
    if (!msg.text && !msg.content) {
      return { valid: false, reason: 'Each message must have text or content' };
    }
    
    // Limit message length
    const content = msg.text || msg.content || '';
    if (content.length > 10000) {
      return { valid: false, reason: 'Message too long (max 10000 characters)' };
    }
    
    // Check for injection in each message
    if (detectPromptInjection(content)) {
      return { valid: false, reason: 'Request contains potentially malicious content', injection: true };
    }
  }
  
  return { valid: true };
};

/**
 * Filter response to remove sensitive information
 */
const filterResponse = (response, isLoggedIn, context = {}) => {
  if (!response || typeof response !== 'string') return response;
  
  let filtered = response;
  
  // Remove any accidentally exposed API keys or secrets (basic pattern matching)
  filtered = filtered.replace(/['"]?[a-z0-9_-]*api[_-]?key['"]?\s*[:=]\s*['"]?[a-z0-9_-]+['"]?/gi, '[REDACTED API KEY]');
  filtered = filtered.replace(/['"]?token['"]?\s*[:=]\s*['"]?[a-z0-9._-]+['"]?/gi, '[REDACTED TOKEN]');
  filtered = filtered.replace(/['"]?password['"]?\s*[:=]\s*['"]?.+?['"]?/gi, '[REDACTED PASSWORD]');
  
  // Add login reminder if unlogged and response mentions database/applications
  if (!isLoggedIn && (response.toLowerCase().includes('application') || response.toLowerCase().includes('database'))) {
    filtered += buildLoginReminder();
  }
  
  return filtered;
};

/**
 * Rate limiting check (in-memory, should use Redis in production)
 */
const userRequestCounts = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_MINUTE = 30; // 30 requests per minute per user

const checkRateLimit = (userId) => {
  const now = Date.now();
  const key = userId || 'anonymous';
  
  if (!userRequestCounts.has(key)) {
    userRequestCounts.set(key, []);
  }
  
  const timestamps = userRequestCounts.get(key);
  
  // Remove old timestamps outside the window
  const validTimestamps = timestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW);
  
  if (validTimestamps.length >= MAX_REQUESTS_PER_MINUTE) {
    return { allowed: false, remaining: 0 };
  }
  
  validTimestamps.push(now);
  userRequestCounts.set(key, validTimestamps);
  
  return { allowed: true, remaining: MAX_REQUESTS_PER_MINUTE - validTimestamps.length };
};

/**
 * Clean old rate limit entries periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of userRequestCounts.entries()) {
    const validTimestamps = timestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW);
    if (validTimestamps.length === 0) {
      userRequestCounts.delete(key);
    } else {
      userRequestCounts.set(key, validTimestamps);
    }
  }
}, 5 * 60 * 1000); // Clean every 5 minutes

module.exports = {
  detectPromptInjection,
  sanitizeInput,
  validateApplicationQuery,
  filterApplicationData,
  buildLoginReminder,
  validateMessages,
  filterResponse,
  checkRateLimit,
};
