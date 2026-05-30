const express = require("express");
const router = express.Router();
const PreListedCode = require("../models/PreListedCode");
const Seller = require("../models/Seller");
const { auth } = require("../middleware/auth");
const multer = require("multer");

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
});

// POST /api/pre-listed-code/submit
// Submit a scanned codebase for pre-listing with complete application information
router.post("/submit", auth, upload.fields([
  { name: "codeZip", maxCount: 1 },
  { name: "screenshots", maxCount: 5 },
  { name: "appIcon", maxCount: 1 }
]), async (req, res) => {
  try {
    const {
      detailedDescription,
      vettScore,
      vettGrade,
      executiveVerdict,
      scanReport,
      fileTree,
      languages,
      frameworks,
      hasTests,
      hasDocumentation,
      appName,
      shortDescription,
      tags,
      appCategory,
      technologyStack,
      price,
      currency,
      isFree,
      licenseType,
      liveDemo,
      githubRepo,
      documentationUrl,
      videoDemo,
      supportedPlatforms,
      dependencies,
      commercialUse,
      resaleRights,
      supportLevel,
      updateFrequency,
      warranty,
      installationSupport,
    } = req.body;

    // Validate required fields
    if (!appName || !shortDescription || !appCategory || !vettScore || !vettGrade || !scanReport) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: appName, shortDescription, appCategory, vettScore, vettGrade, scanReport",
      });
    }

    // Get seller info
    const seller = await Seller.findById(req.userId);
    if (!seller) {
      return res.status(404).json({
        success: false,
        message: "Seller not found. Please register as a seller first.",
      });
    }

    let codeZipUrl = "";
    let codeZipFileId = "";
    let codeSize = 0;
    const uploadedScreenshots = [];
    let uploadedAppIcon = null;

    // Initialize ImageKit
    const ImageKit = require("imagekit");
    const imagekit = new ImageKit({
      publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
      privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
      urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
    });

    // Upload ZIP to ImageKit if provided
    if (req.files && req.files.codeZip && req.files.codeZip[0]) {
      try {
        const zipFile = req.files.codeZip[0];
        const uploadResult = await imagekit.upload({
          file: zipFile.buffer.toString("base64"),
          fileName: `${seller._id}_${appName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.zip`,
          folder: "/vettcode/pre-listed-codes",
          useUniqueFileName: true,
        });

        codeZipUrl = uploadResult.url;
        codeZipFileId = uploadResult.fileId;
        codeSize = zipFile.size;
      } catch (uploadError) {
        console.error("ImageKit ZIP upload error:", uploadError);
        // Continue without ZIP upload - not critical
      }
    }

    // Upload screenshots to ImageKit
    if (req.files && req.files.screenshots) {
      for (const imageFile of req.files.screenshots) {
        try {
          const uploadResult = await imagekit.upload({
            file: imageFile.buffer.toString("base64"),
            fileName: `${seller._id}_${appName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}_${imageFile.originalname}`,
            folder: `/vettcode/pre-listed/${seller._id}`,
            useUniqueFileName: true,
          });

          uploadedScreenshots.push({
            url: uploadResult.url,
            fileId: uploadResult.fileId,
            thumbnailUrl: uploadResult.thumbnailUrl || uploadResult.url,
            fileName: uploadResult.name,
            uploaded: true,
          });
        } catch (uploadError) {
          console.error("ImageKit screenshot upload error:", uploadError);
          // Continue with other screenshots
        }
      }
    }

    // Upload app icon to ImageKit
    if (req.files && req.files.appIcon && req.files.appIcon[0]) {
      try {
        const iconFile = req.files.appIcon[0];
        const uploadResult = await imagekit.upload({
          file: iconFile.buffer.toString("base64"),
          fileName: `${seller._id}_${appName.replace(/[^a-zA-Z0-9]/g, '_')}_icon_${Date.now()}_${iconFile.originalname}`,
          folder: `/vettcode/app-icons/${seller._id}`,
          useUniqueFileName: true,
        });

        uploadedAppIcon = {
          url: uploadResult.url,
          fileId: uploadResult.fileId,
          thumbnailUrl: uploadResult.thumbnailUrl || uploadResult.url,
          fileName: uploadResult.name,
          uploaded: true,
        };
      } catch (uploadError) {
        console.error("ImageKit app icon upload error:", uploadError);
        // Continue without app icon - not critical
      }
    }

    // Parse JSON fields
    const parsedScanReport = typeof scanReport === "string" ? JSON.parse(scanReport) : scanReport;
    const parsedFileTree = fileTree ? (typeof fileTree === "string" ? JSON.parse(fileTree) : fileTree) : null;
    const parsedLanguages = Array.isArray(languages) ? languages : JSON.parse(languages || "[]");
    const parsedFrameworks = Array.isArray(frameworks) ? frameworks : JSON.parse(frameworks || "[]");
    const parsedTechnologyStack = Array.isArray(technologyStack) ? technologyStack : JSON.parse(technologyStack || "[]");
    const parsedSupportedPlatforms = Array.isArray(supportedPlatforms) ? supportedPlatforms : JSON.parse(supportedPlatforms || "[]");
    const parsedDependencies = Array.isArray(dependencies) ? dependencies : JSON.parse(dependencies || "[]");

    // Create pre-listed code entry
    const preListedCode = new PreListedCode({
      developerId: seller._id,
      developerEmail: seller.email,
      developerName: seller.name,
      detailedDescription: detailedDescription || "",
      vettScore: parseFloat(vettScore),
      vettGrade,
      executiveVerdict: executiveVerdict || "",
      scanReport: parsedScanReport,
      fileTree: parsedFileTree,
      codeZipUrl,
      codeZipFileId,
      codeSize,
      languages: parsedLanguages,
      frameworks: parsedFrameworks,
      hasTests: hasTests === "true" || hasTests === true,
      hasDocumentation: hasDocumentation === "true" || hasDocumentation === true,

      // Application model fields
      appName,
      shortDescription,
      tags: tags || "",
      appCategory,
      technologyStack: parsedTechnologyStack,
      price: parseFloat(price) || 0,
      currency: currency || "USD",
      isFree: isFree === "true" || isFree === true,
      licenseType: licenseType || "MIT License",
      liveDemo: liveDemo || "",
      githubRepo: githubRepo || "",
      documentationUrl: documentationUrl || "",
      videoDemo: videoDemo || "",
      supportedPlatforms: parsedSupportedPlatforms,
      dependencies: parsedDependencies,
      commercialUse: commercialUse || "Yes",
      resaleRights: resaleRights || "No",
      supportLevel: supportLevel || "Community",
      updateFrequency: updateFrequency || "Active",
      warranty: warranty || "30 days",
      installationSupport: installationSupport || "Yes",
      screenshots: uploadedScreenshots,
      appIcon: uploadedAppIcon,

      status: "pending_review",
    });

    await preListedCode.save();

    // Update seller profile
    if (!seller.isDeveloper) {
      seller.isDeveloper = true;
      seller.developerProfile = {
        bio: `Developer with ${parsedLanguages.length} languages and ${parsedFrameworks.length} frameworks`,
        skills: [...parsedLanguages, ...parsedFrameworks],
        githubUrl: githubRepo || "",
        portfolioUrl: liveDemo || "",
      };
    }
    seller.preListedCodesCount = (seller.preListedCodesCount || 0) + 1;
    await seller.save();

    res.status(201).json({
      success: true,
      message: "Code successfully pre-listed! You'll be notified when the platform launches.",
      data: {
        id: preListedCode._id,
        appName: preListedCode.appName,
        vettScore: preListedCode.vettScore,
        vettGrade: preListedCode.vettGrade,
        preListedAt: preListedCode.preListedAt,
        screenshotsUploaded: uploadedScreenshots.length,
      },
    });
  } catch (error) {
    console.error("Pre-list submission error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to pre-list code",
      error: error.message,
    });
  }
});

// GET /api/pre-listed-code/my-codes
// Get all pre-listed codes for the authenticated seller
router.get("/my-codes", auth, async (req, res) => {
  try {
    const codes = await PreListedCode.find({ developerId: req.userId })
      .sort({ preListedAt: -1 })
      .select("-scanReport"); // Exclude large scan report from list view

    res.json({
      success: true,
      count: codes.length,
      data: codes,
    });
  } catch (error) {
    console.error("Fetch codes error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch pre-listed codes",
      error: error.message,
    });
  }
});

// GET /api/pre-listed-code/:id
// Get details of a specific pre-listed code
router.get("/:id", auth, async (req, res) => {
  try {
    const code = await PreListedCode.findById(req.params.id);

    if (!code) {
      return res.status(404).json({
        success: false,
        message: "Pre-listed code not found",
      });
    }

    // Check if seller owns this code
    if (code.developerId.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You don't own this code.",
      });
    }

    res.json({
      success: true,
      data: code,
    });
  } catch (error) {
    console.error("Fetch code details error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch code details",
      error: error.message,
    });
  }
});

module.exports = router;