const express = require('express');
const router = express.Router();
const Application = require('../models/Application');
const Seller = require('../models/Seller');
const mongoose = require('mongoose');

// Helper function to validate URL
const isValidUrl = (string) => {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
};

// Helper function to validate required fields
const validateApplicationData = (data, isDraft = false) => {
  const errors = [];
  
  if (!isDraft) {
    // Required fields for published applications
    if (!data.appName?.trim()) errors.push('App name is required');
    if (!data.shortDescription?.trim()) errors.push('Short description is required');
    if (!data.detailedDescription?.trim()) errors.push('Detailed description is required');
    if (!data.appCategory) errors.push('App category is required');
    if (!data.technologyStack || data.technologyStack.length === 0) {
      errors.push('At least one technology is required');
    }
    if (!data.licenseType) errors.push('License type is required');
    // Price validation: if not free, price must be provided and > 0
    if (!data.isFree && (data.price === undefined || data.price === null)) {
      errors.push('Price is required (or mark as free)');
    }
    if (data.isFree) {
      data.price = 0; // Ensure free apps have price set to 0
    }
    if (!data.sellerId) errors.push('Seller ID is required');
    
    // URL validation (only validate if provided)
    if (data.liveDemo && !isValidUrl(data.liveDemo)) {
      errors.push('Live demo URL is not valid');
    }
    if (data.documentationUrl && !isValidUrl(data.documentationUrl)) {
      errors.push('Documentation URL is not valid');
    }
    if (data.videoDemo && !isValidUrl(data.videoDemo)) {
      errors.push('Video demo URL is not valid');
    }
    
    // Screenshots validation
    if (!data.screenshots || data.screenshots.length === 0) {
      errors.push('At least one screenshot is required');
    }
    
    // App icon validation
    if (!data.appIcon) {
      errors.push('App icon is required');
    }
  } else {
    // For drafts, only app name is required
    if (!data.appName?.trim()) errors.push('App name is required for draft');
  }
  
  return errors;
};

// GET /api/applications - Get all verified applications (public)
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      minPrice,
      maxPrice,
      license,
      platform
    } = req.query;
    
    const filters = {
      isDraft: false,
      isActive: true,
      verificationStatus: 'verified'
    };
    
    // Apply filters
    if (category) filters.appCategory = category;
    if (license) filters.licenseType = license;
    if (platform) filters.supportedPlatforms = { $in: [platform] };
    if (minPrice || maxPrice) {
      filters.price = {};
      if (minPrice) filters.price.$gte = parseFloat(minPrice);
      if (maxPrice) filters.price.$lte = parseFloat(maxPrice);
    }
    
    let query = Application.find(filters);
    
    // Apply search
    if (search) {
      query = Application.find({
        ...filters,
        $text: { $search: search }
      }).select({ score: { $meta: 'textScore' } });
    }
    
    // Apply sorting
    const sortOptions = {};
    if (search) {
      sortOptions.score = { $meta: 'textScore' };
    }
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    query = query.sort(sortOptions);
    
    // Apply pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    query = query.skip(skip).limit(parseInt(limit));
    
    // Populate seller info
    query = query.populate('sellerId', 'name email shopName');
    
    const applications = await query.exec();
    const total = await Application.countDocuments(filters);
    
    res.json({
      success: true,
      applications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching applications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch applications',
      error: error.message
    });
  }
});

// GET /api/applications/seller/:sellerId - Get applications by seller
router.get('/seller/:sellerId', async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { includeDrafts = false } = req.query;
    
    if (!mongoose.Types.ObjectId.isValid(sellerId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid seller ID'
      });
    }
    
    const filters = { sellerId };
    if (!includeDrafts) {
      filters.isDraft = false;
    }
    
    const applications = await Application.find(filters)
      .sort({ createdAt: -1 })
      .populate('sellerId', 'name email shopName');
    
    res.json({
      success: true,
      applications
    });
  } catch (error) {
    console.error('Error fetching seller applications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch seller applications',
      error: error.message
    });
  }
});

// GET /api/applications/drafts/seller/:sellerId - Get drafts by seller
router.get('/drafts/seller/:sellerId', async (req, res) => {
  try {
    const { sellerId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(sellerId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid seller ID'
      });
    }
    
    const drafts = await Application.find({
      sellerId,
      isDraft: true
    }).sort({ updatedAt: -1 });
    
    res.json({
      success: true,
      drafts
    });
  } catch (error) {
    console.error('Error fetching drafts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch drafts',
      error: error.message
    });
  }
});

// Paid app = not free; revenue = downloads × price (USD)
const isPaidApplication = (app) => {
  if (app.isFree === true) return false;
  if (app.isFree === false) return true;
  return Number(app.price) > 0;
};

const applicationRevenue = (app) => {
  if (!isPaidApplication(app)) return 0;
  return (Number(app.price) || 0) * (app.downloads || 0);
};

const getAdminRating = (app) => Number(app.adminRating) || 0;

const computeAdminRatingStats = (applications) => {
  const ratedApps = applications.filter((a) => getAdminRating(a) > 0);
  const averageAdminRating =
    ratedApps.length > 0
      ? ratedApps.reduce((s, a) => s + getAdminRating(a), 0) / ratedApps.length
      : 0;
  return {
    averageAdminRating: Number(averageAdminRating.toFixed(1)),
    ratedByAdminCount: ratedApps.length,
  };
};

// GET /api/applications/seller/:sellerId/analytics - Seller analytics overview
router.get('/seller/:sellerId/analytics', async (req, res) => {
  try {
    const { sellerId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(sellerId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid seller ID',
      });
    }

    const applications = await Application.find({
      sellerId,
      isDraft: false,
    })
      .select(
        'appName appCategory verificationStatus price isFree currency views downloads adminRating completionScore screenshots appIcon createdAt updatedAt publishedAt'
      )
      .sort({ downloads: -1, views: -1 });

    const totalViews = applications.reduce((s, a) => s + (a.views || 0), 0);
    const totalDownloads = applications.reduce((s, a) => s + (a.downloads || 0), 0);
    const paidApplications = applications.filter(isPaidApplication);
    const paidDownloads = paidApplications.reduce((s, a) => s + (a.downloads || 0), 0);
    const totalRevenue = paidApplications.reduce((s, a) => s + applicationRevenue(a), 0);
    const adminRatingStats = computeAdminRatingStats(applications);

    const conversionRate =
      totalViews > 0 ? Number(((totalDownloads / totalViews) * 100).toFixed(1)) : 0;

    const categoryMap = {};
    applications.forEach((app) => {
      const cat = app.appCategory || 'Uncategorized';
      if (!categoryMap[cat]) {
        categoryMap[cat] = { category: cat, count: 0, views: 0, downloads: 0, revenue: 0 };
      }
      categoryMap[cat].count += 1;
      categoryMap[cat].views += app.views || 0;
      categoryMap[cat].downloads += app.downloads || 0;
      categoryMap[cat].revenue += applicationRevenue(app);
    });

    const appAnalytics = applications.map((app) => {
      const views = app.views || 0;
      const downloads = app.downloads || 0;
      const paid = isPaidApplication(app);
      return {
        _id: app._id,
        appName: app.appName,
        appCategory: app.appCategory,
        verificationStatus: app.verificationStatus,
        price: app.price,
        isFree: !paid,
        isPaid: paid,
        currency: app.currency || 'USD',
        views,
        downloads,
        adminRating: getAdminRating(app),
        completionScore: app.completionScore || 0,
        conversionRate: views > 0 ? Number(((downloads / views) * 100).toFixed(1)) : 0,
        revenue: applicationRevenue(app),
        screenshots: app.screenshots,
        appIcon: app.appIcon,
        createdAt: app.createdAt,
        updatedAt: app.updatedAt,
        publishedAt: app.publishedAt,
      };
    });

    const verifiedCount = applications.filter(
      (a) => a.verificationStatus === 'verified'
    ).length;

    res.json({
      success: true,
      summary: {
        totalApplications: applications.length,
        paidApplications: paidApplications.length,
        freeApplications: applications.length - paidApplications.length,
        verifiedApplications: verifiedCount,
        pendingApplications: applications.filter((a) => a.verificationStatus === 'pending').length,
        rejectedApplications: applications.filter((a) => a.verificationStatus === 'rejected').length,
        totalViews,
        totalDownloads,
        paidDownloads,
        averageAdminRating: adminRatingStats.averageAdminRating,
        ratedByAdminCount: adminRatingStats.ratedByAdminCount,
        conversionRate,
        totalRevenue: Number(totalRevenue.toFixed(2)),
      },
      applications: appAnalytics,
      categoryBreakdown: Object.values(categoryMap),
      topByDownloads: [...appAnalytics].sort((a, b) => b.downloads - a.downloads).slice(0, 5),
      topByViews: [...appAnalytics].sort((a, b) => b.views - a.views).slice(0, 5),
      topByRevenue: [...appAnalytics].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    });
  } catch (error) {
    console.error('Error fetching seller analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch seller analytics',
      error: error.message,
    });
  }
});

// GET /api/applications/:id - Get single application
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid application ID'
      });
    }
    
    const application = await Application.findById(id)
      .populate('sellerId', 'name email shopName businessAddress city');
    
    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }
    
    // Increment views for non-draft applications (don't fail if this errors)
    if (!application.isDraft) {
      try {
        await application.incrementViews();
      } catch (viewError) {
        console.error('Error incrementing views:', viewError);
        // Continue anyway - don't fail the request
      }
    }
    
    res.json({
      success: true,
      application
    });
  } catch (error) {
    console.error('Error fetching application:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch application',
      error: error.message
    });
  }
});

// POST /api/applications - Create new application
router.post('/', async (req, res) => {
  try {
    const applicationData = req.body;
    
    // DEBUG: Log received data
    console.log('=== BACKEND: Creating Application ===');
    console.log('Received sourceCodeFile:', JSON.stringify(applicationData.sourceCodeFile, null, 2));
    console.log('Has sourceCodeFile:', !!applicationData.sourceCodeFile);
    console.log('sourceCodeFile.url:', applicationData.sourceCodeFile?.url);
    console.log('sourceCodeFile.fileId:', applicationData.sourceCodeFile?.fileId);
    console.log('====================================');
    
    // Validate seller exists
    const seller = await Seller.findById(applicationData.sellerId);
    if (!seller) {
      return res.status(404).json({
        success: false,
        message: 'Seller not found'
      });
    }
    
    // Validate application data
    const validationErrors = validateApplicationData(applicationData, false);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }
    
    // Create application
    const application = new Application({
      ...applicationData,
      isDraft: false,
      verificationStatus: 'pending',
      publishedAt: new Date()
    });
    
    // DEBUG: Log what's being saved
    console.log('=== BACKEND: Saving to Database ===');
    console.log('Application sourceCodeFile before save:', JSON.stringify(application.sourceCodeFile, null, 2));
    console.log('===================================');
    
    await application.save();
    
    // DEBUG: Log what was saved
    console.log('=== BACKEND: After Save ===');
    console.log('Saved sourceCodeFile:', JSON.stringify(application.sourceCodeFile, null, 2));
    console.log('===========================');
    
    // Populate seller info for response
    await application.populate('sellerId', 'name email shopName');
    
    res.status(201).json({
      success: true,
      message: 'Application created successfully',
      application
    });
  } catch (error) {
    console.error('Error creating application:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Application with this name already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to create application',
      error: error.message
    });
  }
});

// POST /api/applications/draft - Save as draft  ← MUST be before /:id
router.post('/draft', async (req, res) => {
  try {
    const draftData = req.body;
    
    // Validate seller exists
    const seller = await Seller.findById(draftData.sellerId);
    if (!seller) {
      return res.status(404).json({
        success: false,
        message: 'Seller not found'
      });
    }
    
    // Validate draft data (minimal validation)
    const validationErrors = validateApplicationData(draftData, true);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }
    
    // Set draft expiration (14 days from now)
    const draftExpiresAt = new Date();
    draftExpiresAt.setDate(draftExpiresAt.getDate() + 14);
    
    // Create draft with minimal required fields
    const draft = new Application({
      appName: draftData.appName,
      shortDescription: draftData.shortDescription || 'Draft - No description yet',
      detailedDescription: draftData.detailedDescription || 'Draft - No detailed description yet',
      appCategory: draftData.appCategory || 'Other',
      tags: draftData.tags || '',
      technologyStack: draftData.technologyStack || [],
      liveDemo: draftData.liveDemo || '',
      documentationUrl: draftData.documentationUrl || '',
      videoDemo: draftData.videoDemo || '',
      screenshots: draftData.screenshots || [],
      appIcon: draftData.appIcon || null,
      sourceCodeFile: draftData.sourceCodeFile || null,  // ADD THIS LINE
      supportedPlatforms: draftData.supportedPlatforms || [],
      dependencies: draftData.dependencies || [],
      licenseType: draftData.licenseType || 'MIT License',
      isFree: draftData.isFree !== undefined ? draftData.isFree : true,
      price: draftData.price || 0,
      currency: draftData.currency || 'USD',
      commercialUse: draftData.commercialUse || 'Yes',
      resaleRights: draftData.resaleRights || 'No',
      supportLevel: draftData.supportLevel || 'Community',
      updateFrequency: draftData.updateFrequency || 'Active',
      warranty: draftData.warranty || '30 days',
      installationSupport: draftData.installationSupport || 'Yes',
      sellerId: draftData.sellerId,
      isDraft: true,
      draftExpiresAt,
      verificationStatus: 'pending'
    });
    
    await draft.save();
    
    res.status(201).json({
      success: true,
      message: 'Draft saved successfully',
      draft: {
        id: draft._id,
        appName: draft.appName,
        createdAt: draft.createdAt,
        expiresAt: draft.draftExpiresAt
      }
    });
  } catch (error) {
    console.error('Error saving draft:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save draft',
      error: error.message
    });
  }
});

// PUT /api/applications/:id - Update application
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid application ID'
      });
    }
    
    const application = await Application.findById(id);
    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }
    
    // Validate update data
    const validationErrors = validateApplicationData(updateData, application.isDraft);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }
    
    // Update application
    Object.assign(application, updateData);
    application.updatedAt = new Date();
    
    // If converting from draft to published
    if (application.isDraft && !updateData.isDraft) {
      application.publishedAt = new Date();
      application.verificationStatus = 'pending';
    }
    
    // Save with error handling
    try {
      await application.save();
    } catch (saveError) {
      console.error('Error saving application:', saveError);
      return res.status(400).json({
        success: false,
        message: 'Failed to save application',
        error: saveError.message,
        details: saveError.errors ? Object.keys(saveError.errors).map(key => ({
          field: key,
          message: saveError.errors[key].message
        })) : []
      });
    }
    
    await application.populate('sellerId', 'name email shopName');
    
    res.json({
      success: true,
      message: 'Application updated successfully',
      application
    });
  } catch (error) {
    console.error('Error updating application:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update application',
      error: error.message
    });
  }
});

// DELETE /api/applications/:id - Delete application
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid application ID'
      });
    }
    
    const application = await Application.findById(id);
    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }
    
    // Initialize ImageKit for deleting files
    let imagekit = null;
    try {
      const ImageKit = require('@imagekit/nodejs');
      imagekit = new ImageKit({
        publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
        privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
        urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
      });
    } catch (error) {
      console.error('ImageKit initialization failed:', error.message);
    }
    
    // Delete images from ImageKit
    const deletionErrors = [];
    
    if (imagekit && typeof imagekit.files?.delete === 'function') {
      try {
        // Delete app icon from ImageKit
        if (application.appIcon?.fileId) {
          try {
            await imagekit.files.delete(application.appIcon.fileId);
            console.log(`✅ Deleted app icon: ${application.appIcon.fileId}`);
          } catch (error) {
            console.error(`❌ Failed to delete app icon: ${application.appIcon.fileId}`, error.message);
            deletionErrors.push(`App icon: ${error.message}`);
          }
        }
        
        // Delete screenshots from ImageKit
        if (application.screenshots && Array.isArray(application.screenshots)) {
          for (const screenshot of application.screenshots) {
            if (screenshot.fileId) {
              try {
                await imagekit.files.delete(screenshot.fileId);
                console.log(`✅ Deleted screenshot: ${screenshot.fileId}`);
              } catch (error) {
                console.error(`❌ Failed to delete screenshot: ${screenshot.fileId}`, error.message);
                deletionErrors.push(`Screenshot: ${error.message}`);
              }
            }
          }
        }
        
        // Delete source code file from ImageKit
        if (application.sourceCodeFile?.fileId) {
          try {
            await imagekit.files.delete(application.sourceCodeFile.fileId);
            console.log(`✅ Deleted source code file: ${application.sourceCodeFile.fileId}`);
          } catch (error) {
            console.error(`❌ Failed to delete source code file: ${application.sourceCodeFile.fileId}`, error.message);
            deletionErrors.push(`Source code file: ${error.message}`);
          }
        }
      } catch (error) {
        console.error('Error during ImageKit cleanup:', error);
        // Continue with database deletion even if ImageKit cleanup fails
      }
    } else {
      console.warn('⚠️ ImageKit not available for file deletion');
    }
    
    // Delete application from database
    await Application.findByIdAndDelete(id);
    
    // Prepare response message
    let message = 'Application deleted successfully';
    if (deletionErrors.length > 0) {
      message += ` (Note: Some images could not be deleted from ImageKit: ${deletionErrors.join(', ')})`;
    }
    
    res.json({
      success: true,
      message: message,
      imageDeletionErrors: deletionErrors.length > 0 ? deletionErrors : undefined
    });
  } catch (error) {
    console.error('Error deleting application:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete application',
      error: error.message
    });
  }
});

// POST /api/applications/:id/verify - Verify application (admin only)
router.post('/:id/verify', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid application ID'
      });
    }
    
    if (!['verified', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification status'
      });
    }
    
    const application = await Application.findById(id);
    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }
    
    application.verificationStatus = status;
    if (notes) application.verificationNotes = notes;
    application.updatedAt = new Date();
    
    await application.save();
    
    res.json({
      success: true,
      message: `Application ${status} successfully`,
      application
    });
  } catch (error) {
    console.error('Error verifying application:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify application',
      error: error.message
    });
  }
});

// GET /api/applications/categories - Get unique categories from applications
router.get('/categories', async (req, res) => {
  try {
    // Get distinct categories from verified, active applications
    const categories = await Application.distinct('appCategory', {
      isDraft: false,
      isActive: true,
      verificationStatus: 'verified'
    });
    
    // Get distinct subcategories for each category
    const categoriesWithSubs = await Promise.all(
      categories.map(async (category) => {
        const subCategories = await Application.distinct('subCategory', {
          appCategory: category,
          isDraft: false,
          isActive: true,
          verificationStatus: 'verified',
          subCategory: { $exists: true, $ne: null, $ne: '' }
        });
        
        return {
          name: category,
          subCategories: subCategories.filter(sub => sub) // Remove null/empty values
        };
      })
    );
    
    res.json({
      success: true,
      categories: categoriesWithSubs.filter(cat => cat.name) // Remove any null categories
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: error.message
    });
  }
});

// GET /api/applications/categories/stats - Get category statistics
router.get('/categories/stats', async (req, res) => {
  try {
    const stats = await Application.aggregate([
      {
        $match: {
          isDraft: false,
          isActive: true,
          verificationStatus: 'verified'
        }
      },
      {
        $group: {
          _id: '$appCategory',
          count: { $sum: 1 },
          avgPrice: { $avg: '$price' },
          avgRating: { $avg: '$rating' }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error fetching category stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch category statistics',
      error: error.message
    });
  }
});

// POST /api/applications/:id/download - Track download
router.post('/:id/download', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid application ID'
      });
    }
    
    const application = await Application.findById(id);
    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }
    
    await application.incrementDownloads();
    
    res.json({
      success: true,
      message: 'Download tracked successfully',
      downloads: application.downloads
    });
  } catch (error) {
    console.error('Error tracking download:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track download',
      error: error.message
    });
  }
});



// ── BULK UPLOAD ROUTES ────────────────────────────────────────────────────────

const multer = require('multer');
const ExcelJS = require('exceljs');
const path = require('path');

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel (.xlsx, .xls) and CSV files are allowed'));
    }
  },
});

const normalizeBulkHeader = (header) =>
  String(header || '')
    .trim()
    .replace(/\s*\*\s*$/, '')
    .trim();

const bulkHeaderToKey = (header) => {
  const norm = normalizeBulkHeader(header).toLowerCase();
  const match = TEMPLATE_COLUMNS.find(
    (col) =>
      col.header.toLowerCase() === norm ||
      col.key.toLowerCase() === norm.replace(/\s+/g, '')
  );
  return match ? match.key : null;
};

const mapBulkRowToApplication = (row) => {
  const mapped = {};
  Object.entries(row).forEach(([header, value]) => {
    const key = bulkHeaderToKey(header);
    if (key) mapped[key] = value;
  });
  return mapped;
};

// Application template columns
const TEMPLATE_COLUMNS = [
  { header: 'Application Name', key: 'appName', width: 30 },
  { header: 'Short Description', key: 'shortDescription', width: 40 },
  { header: 'Detailed Description', key: 'detailedDescription', width: 50 },
  { header: 'Price', key: 'price', width: 12 },
  { header: 'Currency', key: 'currency', width: 10 },
  { header: 'App Category', key: 'appCategory', width: 25 },
  { header: 'Technology Stack', key: 'technologyStack', width: 30 },
  { header: 'Supported Platforms', key: 'supportedPlatforms', width: 30 },
  { header: 'License Type', key: 'licenseType', width: 20 },
  { header: 'GitHub Repository', key: 'githubRepo', width: 40 },
  { header: 'Live Demo URL', key: 'liveDemo', width: 40 },
  { header: 'Screenshot URLs', key: 'screenshots', width: 50 },
  { header: 'Video URL', key: 'videoUrl', width: 40 },
  { header: 'Tags', key: 'tags', width: 30 },
  { header: 'Dependencies', key: 'dependencies', width: 40 },
];

// GET /api/applications/bulk-upload/template/:type - Download template
router.get('/bulk-upload/template/:type', async (req, res) => {
  try {
    const { type } = req.params; // 'blank' or 'existing'
    const sellerId = req.query.sellerId;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Developer Marketplace';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Applications', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    // Set columns
    sheet.columns = TEMPLATE_COLUMNS;

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6366F1' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 25;

    // Add required marker to required columns
    const requiredKeys = ['appName', 'shortDescription', 'price', 'appCategory'];
    sheet.columns.forEach((col, idx) => {
      const cell = headerRow.getCell(idx + 1);
      if (requiredKeys.includes(col.key)) {
        cell.value = `${col.header} *`;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      }
    });

    // Add sample row for blank template
    if (type === 'blank') {
      const sampleRow = sheet.addRow({
        appName: 'My Awesome App',
        shortDescription: 'A brief description of what the app does',
        detailedDescription: 'Full detailed description with features and use cases',
        price: 29.99,
        currency: 'USD',
        appCategory: 'Web Application',
        technologyStack: 'React, Node.js, MongoDB',
        supportedPlatforms: 'Web Browser, iOS, Android',
        licenseType: 'MIT License',
        githubRepo: 'https://github.com/username/repo',
        liveDemo: 'https://demo.example.com',
        screenshots: 'https://example.com/screenshot1.png, https://example.com/screenshot2.png',
        videoUrl: 'https://youtube.com/watch?v=example',
        tags: 'productivity, saas, web',
        dependencies: 'react@18.0.0, express@4.18.0',
      });
      sampleRow.font = { italic: true, color: { argb: 'FF888888' } };
    }

    // Add existing applications if type is 'existing' and sellerId provided
    if (type === 'existing' && sellerId && mongoose.Types.ObjectId.isValid(sellerId)) {
      const applications = await Application.find({ sellerId, isDraft: false }).lean();
      applications.forEach(app => {
        sheet.addRow({
          appName: app.appName || '',
          shortDescription: app.shortDescription || '',
          detailedDescription: app.detailedDescription || '',
          price: app.price || 0,
          currency: app.currency || 'USD',
          appCategory: app.appCategory || '',
          technologyStack: Array.isArray(app.technologyStack) ? app.technologyStack.join(', ') : '',
          supportedPlatforms: Array.isArray(app.supportedPlatforms) ? app.supportedPlatforms.join(', ') : '',
          licenseType: app.licenseType || '',
          githubRepo: app.githubRepo || '',
          liveDemo: app.liveDemo || '',
          screenshots: app.screenshots?.map(s => s.url).filter(Boolean).join(', ') || '',
          videoUrl: app.videoDemo || '',
          tags: app.tags || '',
          dependencies: Array.isArray(app.dependencies)
            ? app.dependencies.map(d => `${d.name}@${d.version}`).join(', ')
            : '',
        });
      });
    }

    // Add info sheet
    const infoSheet = workbook.addWorksheet('Instructions');
    infoSheet.addRow(['Developer Marketplace - Bulk Upload Template']);
    infoSheet.addRow(['']);
    infoSheet.addRow(['REQUIRED FIELDS (marked with *)']);
    infoSheet.addRow(['• Application Name - The name of your application']);
    infoSheet.addRow(['• Short Description - Brief summary (max 200 chars)']);
    infoSheet.addRow(['• Price - Numeric value (e.g. 29.99)']);
    infoSheet.addRow(['• App Category - Must match one of the valid categories']);
    infoSheet.addRow(['']);
    infoSheet.addRow(['VALID CATEGORIES']);
    [
      'Web Application', 'Mobile App (React Native)', 'Mobile App (Native iOS)',
      'Mobile App (Native Android)', 'Desktop Application', 'API/Backend Service',
      'Chrome Extension', 'WordPress Plugin', 'NPM Package/Library',
      'CLI Tool', 'Game', 'E-commerce Platform', 'CMS/Blog Platform',
      'Dashboard/Admin Panel', 'Other'
    ].forEach(cat => infoSheet.addRow([`  • ${cat}`]));
    infoSheet.addRow(['']);
    infoSheet.addRow(['ARRAY FIELDS (use comma-separated values)']);
    infoSheet.addRow(['• Technology Stack: React, Node.js, MongoDB']);
    infoSheet.addRow(['• Supported Platforms: Web Browser, iOS, Android']);
    infoSheet.addRow(['• Screenshot URLs: https://url1.png, https://url2.png']);
    infoSheet.addRow(['• Tags: productivity, saas, web']);

    infoSheet.getColumn(1).width = 60;
    infoSheet.getRow(1).font = { bold: true, size: 14 };

    // Send file
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="applications_${type}_template.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Template generation error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate template', error: error.message });
  }
});

// POST /api/applications/bulk-upload/parse - Parse uploaded file
router.post('/bulk-upload/parse', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const workbook = new ExcelJS.Workbook();
    const isCSV = req.file.originalname.toLowerCase().endsWith('.csv') ||
                  req.file.mimetype === 'text/csv';

    if (isCSV) {
      // Parse CSV
      const csvText = req.file.buffer.toString('utf-8');
      const lines = csvText.split('\n').filter(l => l.trim());
      if (lines.length < 2) {
        return res.status(400).json({ success: false, message: 'CSV file is empty or has no data rows' });
      }
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      const rawRows = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const row = {};
        headers.forEach((h, i) => { row[h] = values[i] || ''; });
        return row;
      });
      const data = rawRows.map(mapBulkRowToApplication).filter((r) => r.appName?.trim());
      return res.json({
        success: true,
        headers,
        data,
        rawRows,
        totalRows: data.length,
      });
    }

    // Parse Excel
    await workbook.xlsx.load(req.file.buffer);
    const worksheet = workbook.worksheets[0];

    if (!worksheet) {
      return res.status(400).json({ success: false, message: 'No worksheet found in file' });
    }

    const fileHeaders = [];
    const rawRows = [];

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        row.eachCell((cell) => {
          const val = cell.value?.toString().trim() || '';
          fileHeaders.push(val);
        });
      } else {
        const rowData = {};
        let hasData = false;
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const header = fileHeaders[colNumber - 1];
          if (header) {
            const val = cell.value !== null && cell.value !== undefined ? cell.value.toString().trim() : '';
            rowData[header] = val;
            if (val) hasData = true;
          }
        });
        if (hasData) rawRows.push(rowData);
      }
    });

    if (fileHeaders.length === 0) {
      return res.status(400).json({ success: false, message: 'No headers found in file' });
    }

    const data = rawRows.map(mapBulkRowToApplication).filter((r) => r.appName?.trim());

    res.json({
      success: true,
      headers: fileHeaders,
      data,
      rawRows,
      totalRows: data.length,
    });
  } catch (error) {
    console.error('File parse error:', error);
    res.status(500).json({ success: false, message: 'Failed to parse file', error: error.message });
  }
});

// POST /api/applications/bulk-upload/process - Process and save applications
router.post('/bulk-upload/process', async (req, res) => {
  try {
    const { applications, sellerId, batchNumber, totalBatches } = req.body;

    if (!applications || !Array.isArray(applications) || applications.length === 0) {
      return res.status(400).json({ success: false, message: 'No applications provided' });
    }

    if (!sellerId || !mongoose.Types.ObjectId.isValid(sellerId)) {
      return res.status(400).json({ success: false, message: 'Valid seller ID is required' });
    }

    // Verify seller exists
    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    let successCount = 0;
    let failedCount = 0;
    const errors = [];
    const created = [];

    for (const appData of applications) {
      try {
        // Basic validation
        if (!appData.appName?.trim()) {
          errors.push({ application: appData.appName || 'Unknown', error: 'Application name is required' });
          failedCount++;
          continue;
        }
        if (!appData.appCategory?.trim()) {
          errors.push({ application: appData.appName, error: 'App category is required' });
          failedCount++;
          continue;
        }

        // Build application object
        const newApp = new Application({
          appName: appData.appName?.trim(),
          shortDescription: appData.shortDescription?.trim() || `${appData.appName} - imported via bulk upload`,
          detailedDescription: appData.detailedDescription?.trim() || appData.shortDescription?.trim() || 'Imported via bulk upload',
          price: parseFloat(appData.price) || 0,
          currency: appData.currency?.trim() || 'USD',
          appCategory: appData.appCategory?.trim(),
          technologyStack: Array.isArray(appData.technologyStack)
            ? appData.technologyStack
            : (appData.technologyStack ? appData.technologyStack.split(',').map(t => t.trim()).filter(Boolean) : []),
          supportedPlatforms: Array.isArray(appData.supportedPlatforms)
            ? appData.supportedPlatforms
            : (appData.supportedPlatforms ? appData.supportedPlatforms.split(',').map(p => p.trim()).filter(Boolean) : []),
          licenseType: appData.licenseType?.trim() || 'MIT License',
          githubRepo: appData.githubRepo?.trim() || 'https://github.com',
          liveDemo: appData.liveDemo?.trim() || 'https://example.com',
          tags: appData.tags?.trim() || '',
          videoDemo: appData.videoUrl?.trim() || '',
          screenshots: appData.screenshots
            ? appData.screenshots.split(',').map(url => url.trim()).filter(Boolean).map(url => ({ url, uploaded: false }))
            : [],
          sellerId,
          verificationStatus: 'pending',
          isDraft: false,
          isActive: true,
          bulkUploaded: true,
        });

        await newApp.save();
        created.push(newApp._id);
        successCount++;
      } catch (err) {
        console.error(`Error saving application "${appData.appName}":`, err.message);
        errors.push({ application: appData.appName || 'Unknown', error: err.message });
        failedCount++;
      }
    }

    res.json({
      success: true,
      message: `Batch ${batchNumber}/${totalBatches} processed`,
      results: {
        success: successCount,
        failed: failedCount,
        errors,
        created,
      },
    });
  } catch (error) {
    console.error('Bulk process error:', error);
    res.status(500).json({ success: false, message: 'Failed to process applications', error: error.message });
  }
});

module.exports = router;