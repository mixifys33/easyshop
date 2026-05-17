/**
 * AI Context Builder Service
 * Builds dynamic system prompts with access control based on user permissions
 */

const { filterApplicationData, buildLoginReminder } = require('./aiSecurityService');
const { truncateFieldsForAI, buildCompactRelatedAppsContext } = require('./aiDataOptimizer');

/**
 * Build enhanced system prompt with user context and access control
 */
const buildEnhancedSystemPrompt = (application, aiContext = {}, relatedApplications = []) => {
  const {
    isLoggedIn = false,
    userEmail = null,
    purchasedApplications = [],
    downloadedApplications = [],
  } = aiContext;

  // Filter application data based on user permissions
  const filteredApp = filterApplicationData(application, isLoggedIn, purchasedApplications);
  
  // Prepare pricing info with login reminder if needed
  let priceDisplay = '';
  if (filteredApp.isFree || filteredApp.price === 0) {
    priceDisplay = 'FREE';
  } else if (isLoggedIn) {
    priceDisplay = `${filteredApp.currency || 'USD'} ${Number(filteredApp.price).toLocaleString()}`;
  } else {
    priceDisplay = 'Paid - Please log in to view details';
  }

  // Tech stack
  const tech = filteredApp.technologyStack?.join(', ') || 'Not specified';
  const platforms = filteredApp.supportedPlatforms?.join(', ') || 'Not specified';
  
  // Technical requirements (only for logged in users or free apps)
  let techRequirements = 'Not specified';
  if (isLoggedIn || filteredApp.isFree) {
    techRequirements = filteredApp.technicalRequirements?.map(r => `- ${r.name}: ${r.value}`).join('\n') || 'Not specified';
  }
  
  // Dependencies (only for logged in users or free apps)
  let dependencies = 'Not specified';
  if (isLoggedIn || filteredApp.isFree) {
    dependencies = filteredApp.dependencies?.map(d => `- ${d.name} ${d.version ? `(${d.version})` : ''}: ${d.description || ''}`).join('\n') || 'Not specified';
  }
  
  const badges = filteredApp.badges?.join(', ') || 'None';

  // Related applications section (filtered based on user permissions)
  let relatedSection = '';
  if (relatedApplications.length > 0) {
    const filteredRelated = relatedApplications
      .map(app => filterApplicationData(app, isLoggedIn, purchasedApplications))
      .filter(Boolean);
    
    if (filteredRelated.length > 0) {
      relatedSection = `\n\nOTHER AVAILABLE APPLICATIONS IN THE SAME CATEGORY:\n${formatRelatedApplications(filteredRelated, isLoggedIn)}\n\nWhen the user asks for comparisons, alternatives, cheaper or better options — use ONLY the applications listed above. Never invent or mention applications not listed here.`;
    }
  }

  // User status context
  const userStatus = isLoggedIn 
    ? `The user is logged in as: ${userEmail}`
    : `The user is NOT logged in (browsing as guest). Remind them to log in for full access to application details and downloads.`;

  // Build the full system prompt
  const systemPrompt = `You are VettCode AI, a helpful AI assistant for VETTCODE, a global marketplace for verified, production-ready applications and codebases. You NEVER answer in table format. When data needs to be structured, organized, or compared, DO NOT use rows and columns. Instead, use nested bulleted lists, bold text for headers, and paragraphs. Ensure all information is presented as clean text or markdown bullet points only.

Do not recommend other platforms or marketplaces. If the user needs something not shown, direct them to use the search bar on VETTCODE.

USER CONTEXT:
${userStatus}
${isLoggedIn ? `Purchased Applications: ${purchasedApplications.length > 0 ? purchasedApplications.join(', ') : 'None yet'}\nDownloaded Apps: ${downloadedApplications.length > 0 ? downloadedApplications.join(', ') : 'None yet'}` : ''}

CURRENT APPLICATION:
- Name: ${filteredApp.appName || filteredApp.name || filteredApp.title || 'Unknown'}
- Price: ${priceDisplay}
- Category: ${filteredApp.appCategory || 'N/A'}
- Sub-category: ${filteredApp.subCategory || 'N/A'}
- Technology Stack: ${tech}
- Supported Platforms: ${platforms}
${isLoggedIn || filteredApp.isFree ? `- License Type: ${filteredApp.licenseType || 'Not specified'}
- Commercial Use: ${filteredApp.commercialUse || 'Not specified'}
- Resale Rights: ${filteredApp.resaleRights || 'Not specified'}` : '- License: Contact seller for details (log in to see more)'}
- Rating: ${filteredApp.rating ? `⭐ ${filteredApp.rating}/5` : 'No ratings yet'}
- Downloads: ${filteredApp.downloads ? `${filteredApp.downloads.toLocaleString()} downloads` : 'New application'}
- Views: ${filteredApp.views ? `${filteredApp.views.toLocaleString()} views` : '0 views'}
- Verification Status: ${filteredApp.verificationStatus === 'verified' ? '✅ Production-Ready & Verified' : '⏳ Under Review'}
- Badges: ${badges}
- Short Description: ${filteredApp.shortDescription || 'No description'}
${isLoggedIn || filteredApp.isFree ? `- Detailed Description: ${filteredApp.detailedDescription || 'No detailed description available'}` : '- Detailed Description: Available to logged-in users'}
- Seller/Developer: ${filteredApp.sellerId?.name || filteredApp.seller?.name || 'VETTCODE'}
- Seller Verified: ${filteredApp.sellerId?.verified || filteredApp.seller?.verified ? 'Yes ✅' : 'No'}
- Support Level: ${filteredApp.supportLevel || 'Community'}
- Update Frequency: ${filteredApp.updateFrequency || 'Active'}
- Installation Support: ${filteredApp.installationSupport || 'Yes'}
- Warranty: ${filteredApp.warranty || '30 days'}
${isLoggedIn || filteredApp.isFree ? `- Live Demo: ${filteredApp.liveDemo || 'Not available'}
- GitHub Repo: ${filteredApp.githubRepo || 'Not available'}
- Documentation: ${filteredApp.documentationUrl || 'Not available'}
- Video Demo: ${filteredApp.videoDemo || 'Not available'}` : '- Links: Available to logged-in users and after purchase'}

${isLoggedIn || filteredApp.isFree ? `TECHNICAL REQUIREMENTS:
${techRequirements}

DEPENDENCIES:
${dependencies}` : 'TECHNICAL DETAILS: Available to logged-in users and after purchase'}

${relatedSection}

YOUR ROLE:
- Answer questions about this application honestly and helpfully
- Help developers decide if this application suits their project needs
- Explain technical specifications, tech stack, and implementation details clearly
- Compare with real alternatives from VETTCODE when asked
- Discuss security, scalability, and production-readiness
${isLoggedIn ? '- Provide insights on licensing, commercial use, and resale rights' : '- For licensing details, recommend logging in to see full information'}
${filteredApp.isFree ? '- This is a FREE application - users can download and use it immediately' : `- This is a PAID application (${priceDisplay})${isLoggedIn ? ' - users can purchase or download if already purchased' : ' - available to logged-in users'}`}
- Be concise — short and direct unless detail is needed
- Never make up specs, prices, features, or applications not listed above
- Always be professional, friendly, and supportive
- Focus on code quality, developer experience, and business value
${isLoggedIn ? '' : '- Regularly remind users that logging in provides full access to all features'}

${!isLoggedIn ? `IMPORTANT: This user is NOT logged in. When discussing this application or any features from the database:
1. Provide helpful information about what's available
2. Clearly indicate what additional information is available to logged-in users
3. Recommend logging in or signing up to access full details, downloads, and comparisons
4. Never deny service, but make it clear that login unlocks more features` : ''}

The user is viewing this application and does NOT need to re-explain what they're looking at.`;

  return systemPrompt;
};

/**
 * Format related applications for display (using compact format)
 */
const formatRelatedApplications = (applications, isLoggedIn = false) => {
  // Use compact format to prevent AI overload
  return buildCompactRelatedAppsContext(applications, 5);
};

/**
 * Build system prompt for free apps search
 */
const buildSearchSystemPrompt = (aiContext = {}) => {
  const { isLoggedIn = false, userEmail = null } = aiContext;
  
  const userStatus = isLoggedIn 
    ? `The user is logged in as: ${userEmail}`
    : `The user is NOT logged in (browsing as guest).`;

  return `You are VettCode AI, a search assistant for VETTCODE marketplace. Your role is to help users find the perfect application for their needs.

USER CONTEXT:
${userStatus}

SEARCH GUIDELINES:
- Help users describe what they're looking for
- Ask clarifying questions about their needs (budget, platform, features, etc)
- Search results are shown as applications from our database
- For free applications, provide full details
- For paid applications, show basic info (name, price, rating, category)
- Always be helpful and professional

${!isLoggedIn ? `IMPORTANT: This user is NOT logged in.
- Provide search results and recommendations
- For free apps, they can download directly
- For paid apps, recommend logging in to purchase or learn more
- Encourage them to sign up for full access` : ''}

Search results should include application name, category, whether it's free, rating, and brief description. Use bullet points for clarity.`;
};

/**
 * Utility to check if app is accessible to user
 */
const isAppAccessible = (application, aiContext = {}) => {
  const { isLoggedIn = false, purchasedApplications = [] } = aiContext;
  
  const isFree = application.isFree || application.price === 0;
  const userOwns = purchasedApplications.includes(String(application._id));
  
  return isFree || (isLoggedIn && userOwns);
};

/**
 * Get list of downloadable apps from array (free apps only)
 */
const getDownloadableApps = (applications = []) => {
  return applications.filter(app => app.isFree || app.price === 0);
};

module.exports = {
  buildEnhancedSystemPrompt,
  formatRelatedApplications,
  buildSearchSystemPrompt,
  isAppAccessible,
  getDownloadableApps,
};
