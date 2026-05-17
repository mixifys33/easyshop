/**
 * AI Install/Download Route
 * Handles free application downloads and tracking
 */

const express = require('express');
const router = express.Router();
const aiAuth = require('../middleware/aiAuth');
const Application = require('../models/Application');
const {
  checkRateLimit,
} = require('../services/aiSecurityService');

// Apply AI auth middleware
router.use(aiAuth);

/**
 * POST /api/ai/install
 * Request download/install for a free application
 * Body: { applicationId: string }
 */
router.post('/install', async (req, res) => {
  try {
    const { applicationId } = req.body;
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
    if (!applicationId || typeof applicationId !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Application ID is required',
      });
    }

    // Fetch application
    const application = await Application.findById(applicationId)
      .select('appName price isFree currency sourceCodeFile _id isDraft isActive verificationStatus')
      .lean();

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found',
      });
    }

    // Check if application is available
    if (application.isDraft || !application.isActive || application.verificationStatus !== 'verified') {
      return res.status(403).json({
        success: false,
        message: 'This application is not currently available for download',
      });
    }

    // Check if application is free
    if (!application.isFree && application.price && application.price > 0) {
      return res.status(403).json({
        success: false,
        message: 'This is a paid application. Only free applications can be downloaded via AI.',
        requiresPurchase: true,
      });
    }

    // Check if source code file exists
    if (!application.sourceCodeFile || !application.sourceCodeFile.url) {
      return res.status(404).json({
        success: false,
        message: 'Download file is not available for this application',
      });
    }

    // Increment download counter
    try {
      await Application.updateOne(
        { _id: applicationId },
        { $inc: { downloads: 1 } }
      );
    } catch (err) {
      console.error('Error incrementing downloads:', err);
      // Don't fail the request if counter update fails
    }

    // Log download (if user is logged in)
    if (aiContext.isLoggedIn && aiContext.userId) {
      try {
        // This could be used to track user download history
        console.log(`📥 Download: App="${application.appName}" | User="${aiContext.userEmail}"`);
      } catch (err) {
        console.error('Error logging download:', err);
      }
    }

    const responsePayload = {
      success: true,
      message: `Ready to download ${application.appName}`,
      application: {
        _id: application._id,
        appName: application.appName,
        isFree: application.isFree,
      },
      downloadUrl: application.sourceCodeFile.url,
      downloadInfo: {
        fileName: application.sourceCodeFile.fileName,
        fileSize: application.sourceCodeFile.fileSize,
      },
      loginReminder: !aiContext.isLoggedIn 
        ? 'Log in to track your downloads and access your download history' 
        : undefined,
    };

    res.json(responsePayload);

  } catch (error) {
    console.error('Install error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Install error', 
      error: error.message 
    });
  }
});

/**
 * POST /api/ai/download-multiple
 * Request downloads for multiple free applications
 * Body: { applicationIds: string[] }
 */
router.post('/download-multiple', async (req, res) => {
  try {
    const { applicationIds } = req.body;
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

    if (applicationIds.length > 10) {
      return res.status(400).json({
        success: false,
        message: 'Cannot download more than 10 applications at once',
      });
    }

    // Fetch applications
    const applications = await Application.find({
      _id: { $in: applicationIds },
      isDraft: false,
      isActive: true,
      verificationStatus: 'verified',
      isFree: true,
    })
      .select('appName price isFree sourceCodeFile _id')
      .lean();

    if (applications.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No free applications found',
      });
    }

    // Filter out apps without download files
    const downloadableApps = applications.filter(app => app.sourceCodeFile?.url);

    if (downloadableApps.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Selected applications do not have download files available',
      });
    }

    // Increment download counters
    try {
      await Application.updateMany(
        { _id: { $in: downloadableApps.map(a => a._id) } },
        { $inc: { downloads: 1 } }
      );
    } catch (err) {
      console.error('Error incrementing downloads:', err);
    }

    // Log downloads
    if (aiContext.isLoggedIn && aiContext.userId) {
      console.log(`📥 Batch Download: Apps="${downloadableApps.map(a => a.appName).join(', ')}" | User="${aiContext.userEmail}"`);
    }

    const responsePayload = {
      success: true,
      message: `Ready to download ${downloadableApps.length} application(s)`,
      downloadCount: downloadableApps.length,
      downloads: downloadableApps.map(app => ({
        _id: app._id,
        appName: app.appName,
        downloadUrl: app.sourceCodeFile.url,
        fileName: app.sourceCodeFile.fileName,
        fileSize: app.sourceCodeFile.fileSize,
      })),
      loginReminder: !aiContext.isLoggedIn 
        ? 'Log in to track your downloads and access your download history' 
        : undefined,
    };

    res.json(responsePayload);

  } catch (error) {
    console.error('Multiple download error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Download error', 
      error: error.message 
    });
  }
});

/**
 * GET /api/ai/download/:applicationId
 * Get download information for a free application
 */
router.get('/download/:applicationId', async (req, res) => {
  try {
    const { applicationId } = req.params;
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

    const application = await Application.findById(applicationId)
      .select('appName price isFree currency sourceCodeFile _id isDraft isActive verificationStatus downloads')
      .lean();

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found',
      });
    }

    // Check if application is free
    if (!application.isFree || (application.price && application.price > 0)) {
      return res.status(403).json({
        success: false,
        message: 'Only free applications can be downloaded',
        price: application.price,
        currency: application.currency,
      });
    }

    // Check if source file exists
    if (!application.sourceCodeFile || !application.sourceCodeFile.url) {
      return res.status(404).json({
        success: false,
        message: 'Download file is not available',
      });
    }

    const responsePayload = {
      success: true,
      application: {
        _id: application._id,
        appName: application.appName,
        isFree: true,
        downloads: application.downloads || 0,
      },
      downloadInfo: {
        fileName: application.sourceCodeFile.fileName,
        fileSize: application.sourceCodeFile.fileSize,
        url: application.sourceCodeFile.url,
      },
      canDownload: true,
    };

    res.json(responsePayload);

  } catch (error) {
    console.error('Get download info error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching download information', 
      error: error.message 
    });
  }
});

module.exports = router;
