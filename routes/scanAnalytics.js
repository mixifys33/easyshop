const express = require('express');
const router = express.Router();
const ScanAnalytics = require('../models/ScanAnalytics');
const { authenticateToken } = require('../middleware/auth');

// Admin auth middleware - checks if user is admin
// Accepts both role='admin' and userType='Admin' for compatibility
function adminOnly(req, res, next) {
  const isAdmin = req.user?.role === 'admin' || 
                  req.user?.userType === 'Admin' ||
                  req.user?.isAdmin === true;
  
  if (!isAdmin) {
    console.log('[Admin Check] User data:', { 
      role: req.user?.role, 
      userType: req.user?.userType,
      isAdmin: req.user?.isAdmin,
      email: req.user?.email 
    });
    return res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
  }
  next();
}

/**
 * @route   POST /api/scan-analytics
 * @desc    Log a scan analytics entry
 * @access  Public (can be called by anyone, including unauthenticated users)
 */
router.post('/', async (req, res) => {
  try {
    const {
      scanId,
      userId,
      userEmail,
      userName,
      isAuthenticated,
      projectName,
      scanMode,
      score,
      grade,
      filesScanned,
      linesScanned,
      criticalFindings,
      highFindings,
      mediumFindings,
      lowFindings,
      infoFindings,
      totalFindings,
      scanDurationMs,
      tokensSaved,
      scannersUsed,
      success,
      errorMessage,
    } = req.body;

    // Validate required fields
    if (!scanId || !projectName || score === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: scanId, projectName, score',
      });
    }

    // Get IP address and user agent
    const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    // Create new analytics entry
    const analytics = new ScanAnalytics({
      scanId,
      userId: userId || null,
      userEmail: userEmail || null,
      userName: userName || null,
      isAuthenticated: isAuthenticated || false,
      projectName,
      scanMode: scanMode || 'quick',
      score,
      grade: grade || 'F',
      filesScanned: filesScanned || 0,
      linesScanned: linesScanned || 0,
      criticalFindings: criticalFindings || 0,
      highFindings: highFindings || 0,
      mediumFindings: mediumFindings || 0,
      lowFindings: lowFindings || 0,
      infoFindings: infoFindings || 0,
      totalFindings: totalFindings || 0,
      scanDurationMs: scanDurationMs || 0,
      tokensSaved: tokensSaved || 'N/A',
      scannersUsed: scannersUsed || [],
      success: success !== undefined ? success : true,
      errorMessage: errorMessage || null,
      ipAddress,
      userAgent,
    });

    await analytics.save();

    console.log(`[Scan Analytics] Logged scan ${scanId} for ${isAuthenticated ? userEmail : 'unauthenticated user'}`);

    res.status(201).json({
      success: true,
      message: 'Scan analytics logged successfully',
      data: {
        scanId: analytics.scanId,
        createdAt: analytics.createdAt,
      },
    });

  } catch (error) {
    console.error('[Scan Analytics] Error logging scan:', error);
    
    // If duplicate scanId, return success (idempotent)
    if (error.code === 11000) {
      return res.status(200).json({
        success: true,
        message: 'Scan analytics already logged',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to log scan analytics',
      message: error.message,
    });
  }
});

/**
 * @route   GET /api/scan-analytics/summary
 * @desc    Get analytics summary statistics
 * @access  Admin only
 */
router.get('/summary', authenticateToken, adminOnly, async (req, res) => {
  try {
    const { period = 'all', authenticated } = req.query;

    // Build filters
    const filters = {};
    
    if (authenticated === 'true') {
      filters.isAuthenticated = true;
    } else if (authenticated === 'false') {
      filters.isAuthenticated = false;
    }

    // Add date filter if period specified
    if (period !== 'all') {
      const now = new Date();
      let startDate;

      switch (period) {
        case 'day':
          startDate = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'month':
          startDate = new Date(now.setMonth(now.getMonth() - 1));
          break;
        case 'year':
          startDate = new Date(now.setFullYear(now.getFullYear() - 1));
          break;
      }

      if (startDate) {
        filters.createdAt = { $gte: startDate };
      }
    }

    // Get summary statistics
    const summary = await ScanAnalytics.getSummaryStats(filters);

    // Get scans by period
    const scansToday = await ScanAnalytics.getScansByPeriod('day');
    const scansThisWeek = await ScanAnalytics.getScansByPeriod('week');
    const scansThisMonth = await ScanAnalytics.getScansByPeriod('month');

    // Get top projects
    const topProjects = await ScanAnalytics.getTopProjects(10);

    // Get grade distribution
    const gradeDistribution = await ScanAnalytics.aggregate([
      { $match: filters },
      {
        $group: {
          _id: '$grade',
          count: { $sum: 1 },
        }
      },
      { $sort: { _id: 1 } },
    ]);

    // Get scan mode distribution
    const scanModeDistribution = await ScanAnalytics.aggregate([
      { $match: filters },
      {
        $group: {
          _id: '$scanMode',
          count: { $sum: 1 },
        }
      },
    ]);

    res.json({
      success: true,
      data: {
        summary: {
          ...summary,
          averageScore: Math.round(summary.averageScore * 10) / 10,
          averageScanDuration: Math.round(summary.averageScanDuration / 1000), // Convert to seconds
        },
        timePeriods: {
          today: scansToday,
          thisWeek: scansThisWeek,
          thisMonth: scansThisMonth,
        },
        topProjects,
        gradeDistribution: gradeDistribution.map(g => ({
          grade: g._id,
          count: g.count,
        })),
        scanModeDistribution: scanModeDistribution.map(s => ({
          mode: s._id,
          count: s.count,
        })),
      },
    });

  } catch (error) {
    console.error('[Scan Analytics] Error fetching summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analytics summary',
      message: error.message,
    });
  }
});

/**
 * @route   GET /api/scan-analytics/scans
 * @desc    Get paginated list of scans
 * @access  Admin only
 */
router.get('/scans', authenticateToken, adminOnly, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      authenticated,
      success,
      minScore,
      maxScore,
      search,
    } = req.query;

    // Build filters
    const filters = {};
    
    if (authenticated === 'true') filters.isAuthenticated = true;
    if (authenticated === 'false') filters.isAuthenticated = false;
    if (success === 'true') filters.success = true;
    if (success === 'false') filters.success = false;
    
    if (minScore) filters.score = { $gte: Number(minScore) };
    if (maxScore) filters.score = { ...filters.score, $lte: Number(maxScore) };
    
    if (search) {
      filters.$or = [
        { projectName: { $regex: search, $options: 'i' } },
        { userEmail: { $regex: search, $options: 'i' } },
        { userName: { $regex: search, $options: 'i' } },
      ];
    }

    // Calculate skip
    const skip = (Number(page) - 1) * Number(limit);

    // Get scans
    const scans = await ScanAnalytics.find(filters)
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .skip(skip)
      .limit(Number(limit))
      .select('-ipAddress -userAgent') // Exclude sensitive fields
      .lean();

    // Get total count
    const total = await ScanAnalytics.countDocuments(filters);

    res.json({
      success: true,
      data: {
        scans,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      },
    });

  } catch (error) {
    console.error('[Scan Analytics] Error fetching scans:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch scans',
      message: error.message,
    });
  }
});

/**
 * @route   GET /api/scan-analytics/user/:userId
 * @desc    Get scan analytics for a specific user
 * @access  Admin only (or the user themselves)
 */
router.get('/user/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    // Check if user is admin or accessing their own data
    const isAdmin = req.user.role === 'admin';
    const isOwnData = req.user._id.toString() === userId;

    if (!isAdmin && !isOwnData) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to access this data',
      });
    }

    const skip = (Number(page) - 1) * Number(limit);

    const scans = await ScanAnalytics.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .select('-ipAddress -userAgent')
      .lean();

    const total = await ScanAnalytics.countDocuments({ userId });

    // Get user summary
    const summary = await ScanAnalytics.getSummaryStats({ userId });

    res.json({
      success: true,
      data: {
        scans,
        summary: {
          ...summary,
          averageScore: Math.round(summary.averageScore * 10) / 10,
        },
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      },
    });

  } catch (error) {
    console.error('[Scan Analytics] Error fetching user scans:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user scans',
      message: error.message,
    });
  }
});

/**
 * @route   GET /api/scan-analytics/trends
 * @desc    Get scan trends over time
 * @access  Admin only
 */
router.get('/trends', authenticateToken, adminOnly, async (req, res) => {
  try {
    const { period = 'week' } = req.query;

    let groupBy;
    let startDate = new Date();

    switch (period) {
      case 'day':
        groupBy = { $hour: '$createdAt' };
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        groupBy = { $dayOfWeek: '$createdAt' };
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        groupBy = { $dayOfMonth: '$createdAt' };
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'year':
        groupBy = { $month: '$createdAt' };
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default:
        groupBy = { $dayOfWeek: '$createdAt' };
        startDate.setDate(startDate.getDate() - 7);
    }

    const trends = await ScanAnalytics.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: groupBy,
          scans: { $sum: 1 },
          averageScore: { $avg: '$score' },
          authenticatedScans: {
            $sum: { $cond: ['$isAuthenticated', 1, 0] }
          },
          totalFindings: { $sum: '$totalFindings' },
        }
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      success: true,
      data: trends.map(t => ({
        period: t._id,
        scans: t.scans,
        averageScore: Math.round(t.averageScore * 10) / 10,
        authenticatedScans: t.authenticatedScans,
        totalFindings: t.totalFindings,
      })),
    });

  } catch (error) {
    console.error('[Scan Analytics] Error fetching trends:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch trends',
      message: error.message,
    });
  }
});

module.exports = router;
