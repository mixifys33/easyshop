const express = require('express');
const router = express.Router();
const ImageKit = require('@imagekit/nodejs');

// Initialize ImageKit
const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

// POST /api/upload/imagekit - Upload image to ImageKit
router.post('/imagekit', async (req, res) => {
  try {
    const { file, fileName, folder } = req.body;
    
    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No file provided'
      });
    }
    
    // Upload to ImageKit
    const uploadResult = await imagekit.upload({
      file: file,
      fileName: fileName || `upload_${Date.now()}.jpg`,
      folder: folder || 'applications',
      useUniqueFileName: true,
    });
    
    res.json({
      success: true,
      url: uploadResult.url,
      fileId: uploadResult.fileId,
      thumbnailUrl: uploadResult.thumbnailUrl,
      fileName: uploadResult.name,
      filePath: uploadResult.filePath,
    });
  } catch (error) {
    console.error('ImageKit upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload image',
      error: error.message
    });
  }
});

// DELETE /api/upload/imagekit/:fileId - Delete image from ImageKit
router.delete('/imagekit/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    if (!fileId) {
      return res.status(400).json({
        success: false,
        message: 'No fileId provided'
      });
    }
    
    await imagekit.deleteFile(fileId);
    
    res.json({
      success: true,
      message: 'Image deleted successfully'
    });
  } catch (error) {
    console.error('ImageKit delete error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete image',
      error: error.message
    });
  }
});

module.exports = router;
