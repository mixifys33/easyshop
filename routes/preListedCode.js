const express = require("express");
const router = express.Router();
const PreListedCode = require("../models/PreListedCode");
const Seller = require("../models/Seller");
const auth = require("../middleware/auth");
const multer = require("multer");

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
});

// POST /api/pre-listed-code/submit
// Submit a scanned codebase for pre-listing with complete product information
router.post("/submit", auth, upload.fields([
  { name: "codeZip", maxCount: 1 },
  { name: "images", maxCount: 5 }
]), async (req, res) => {
  try {
    const {
      projectName,
      projectDescription,
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
      category,
      subCategory,
      tags,
      regularPrice,
      salePrice,
      licenseType,
      demoUrl,
      documentationUrl,
      videoUrl,
      features,
    } = req.body;

    // Validate required fields
    if (!projectName || !vettScore || !vettGrade || !scanReport) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: projectName, vettScore, vettGrade, scanReport",
      });
    }

    if (!category || !subCategory || !regularPrice || !salePrice) {
      return res.status(400).json({
        success: false,
        message: "Missing required product fields: category, subCategory, regularPrice, salePrice",
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
    const uploadedImages = [];

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
          fileName: `${seller._id}_${projectName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.zip`,
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

    // Upload product images to ImageKit
    if (req.files && req.files.images) {
      for (const imageFile of req.files.images) {
        try {
          const uploadResult = await imagekit.upload({
            file: imageFile.buffer.toString("base64"),
            fileName: `${seller._id}_${projectName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}_${imageFile.originalname}`,
            folder: `/vettcode/pre-listed/${seller._id}`,
            useUniqueFileName: true,
          });

          uploadedImages.push({
            url: uploadResult.url,
            fileId: uploadResult.fileId,
            thumbnailUrl: uploadResult.thumbnailUrl || uploadResult.url,
            fileName: uploadResult.name,
          });
        } catch (uploadError) {
          console.error("ImageKit image upload error:", uploadError);
          // Continue with other images
        }
      }
    }

    // Parse JSON fields
    const parsedScanReport = typeof scanReport === "string" ? JSON.parse(scanReport) : scanReport;
    const parsedFileTree = fileTree ? (typeof fileTree === "string" ? JSON.parse(fileTree) : fileTree) : null;
    const parsedLanguages = Array.isArray(languages) ? languages : JSON.parse(languages || "[]");
    const parsedFrameworks = Array.isArray(frameworks) ? frameworks : JSON.parse(frameworks || "[]");
    const parsedFeatures = Array.isArray(features) ? features : JSON.parse(features || "[]");

    // Create pre-listed code entry
    const preListedCode = new PreListedCode({
      developerId: seller._id,
      developerEmail: seller.email,
      developerName: seller.name,
      projectName,
      projectDescription: projectDescription || "",
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
      category,
      subCategory,
      tags: tags || "",
      regularPrice: parseFloat(regularPrice),
      salePrice: parseFloat(salePrice),
      currency: "USD",
      licenseType: licenseType || "Commercial",
      images: uploadedImages,
      demoUrl: demoUrl || "",
      documentationUrl: documentationUrl || "",
      videoUrl: videoUrl || "",
      features: parsedFeatures,
      status: "pending_review",
    });

    await preListedCode.save();

    // Update seller profile
    if (!seller.isDeveloper) {
      seller.isDeveloper = true;
      seller.developerProfile = {
        bio: `Developer with ${parsedLanguages.length} languages and ${parsedFrameworks.length} frameworks`,
        skills: [...parsedLanguages, ...parsedFrameworks],
        githubUrl: "",
        portfolioUrl: "",
      };
    }
    seller.preListedCodesCount = (seller.preListedCodesCount || 0) + 1;
    await seller.save();

    res.status(201).json({
      success: true,
      message: "Code successfully pre-listed! You'll be notified when the platform launches.",
      data: {
        id: preListedCode._id,
        projectName: preListedCode.projectName,
        vettScore: preListedCode.vettScore,
        vettGrade: preListedCode.vettGrade,
        preListedAt: preListedCode.preListedAt,
        imagesUploaded: uploadedImages.length,
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

// PATCH /api/pre-listed-code/:id/update-price
// Seller updates suggested price for their pre-listed code
router.patch("/:id/update-price", auth, async (req, res) => {
  try {
    const { suggestedPrice } = req.body;

    if (suggestedPrice == null || suggestedPrice < 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid price. Must be a positive number.",
      });
    }

    const code = await PreListedCode.findById(req.params.id);

    if (!code) {
      return res.status(404).json({
        success: false,
        message: "Pre-listed code not found",
      });
    }

    if (code.developerId.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    code.suggestedPrice = suggestedPrice;
    await code.save();

    res.json({
      success: true,
      message: "Price updated successfully",
      data: { suggestedPrice: code.suggestedPrice },
    });
  } catch (error) {
    console.error("Update price error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update price",
      error: error.message,
    });
  }
});

module.exports = router;
