const express = require('express');
const router = express.Router();

console.log('🔧 Loading ImageKit routes...');

// Initialize ImageKit
let imagekit = null;

try {
  const ImageKit = require('@imagekit/nodejs');
  
  console.log('🔧 Initializing ImageKit instance...');
  console.log('Public Key:', process.env.IMAGEKIT_PUBLIC_KEY ? 'Set' : 'Missing');
  console.log('Private Key:', process.env.IMAGEKIT_PRIVATE_KEY ? 'Set' : 'Missing');
  console.log('URL Endpoint:', process.env.IMAGEKIT_URL_ENDPOINT ? 'Set' : 'Missing');
  
  imagekit = new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
  });
  
  console.log('✅ ImageKit initialized successfully');
  
  // Verify the methods are available on imagekit.files (correct API for @imagekit/nodejs v5+)
  if (typeof imagekit.files?.upload === 'function') {
    console.log('✅ Upload method is available at imagekit.files.upload');
  } else {
    console.error('❌ Upload method is NOT available');
  }
  
  if (typeof imagekit.files?.delete === 'function') {
    console.log('✅ Delete method is available at imagekit.files.delete');
  } else {
    console.error('❌ Delete method is NOT available');
  }
  
} catch (error) {
  console.error('❌ ImageKit initialization failed:', error.message);
  console.error('Full error:', error);
}

// Simple test route to verify routes are working
router.get('/ping', (req, res) => {
  console.log('📍 ImageKit ping route hit');
  res.json({ message: 'ImageKit routes are working', timestamp: new Date().toISOString() });
});

/**
 * Test ImageKit connection
 */
router.get('/test', (req, res) => {
  console.log('📍 ImageKit test endpoint hit');
  
  const status = {
    initialized: !!imagekit,
    uploadMethod: imagekit?.files ? typeof imagekit.files.upload : 'N/A',
    deleteMethod: imagekit?.files ? typeof imagekit.files.delete : 'N/A',
    instanceType: imagekit ? typeof imagekit : 'N/A',
    constructor: imagekit ? imagekit.constructor.name : 'N/A',
    envVars: {
      publicKey: !!process.env.IMAGEKIT_PUBLIC_KEY,
      privateKey: !!process.env.IMAGEKIT_PRIVATE_KEY,
      urlEndpoint: !!process.env.IMAGEKIT_URL_ENDPOINT
    }
  };
  
  console.log('ImageKit status:', status);
  
  res.json({
    success: true,
    status: status,
    message: imagekit ? 'ImageKit is initialized and working' : 'ImageKit is not initialized'
  });
});

/**
 * ImageKit authentication endpoint
 * This endpoint provides authentication parameters for client-side uploads
 */
router.get('/auth', (req, res) => {
  try {
    // Generate authentication parameters for client-side upload
    const token = req.query.token || '';
    const expire = req.query.expire || '';
    const signature = req.query.signature || '';
    
    // For @imagekit/nodejs, we need to generate the signature manually
    const crypto = require('crypto');
    const defaultExpire = Math.floor(Date.now() / 1000) + 2400; // 40 minutes from now
    
    const authParams = {
      token: token || crypto.randomBytes(10).toString('hex'),
      expire: expire || defaultExpire,
      signature: ''
    };
    
    // Generate signature
    const stringToSign = authParams.token + authParams.expire;
    authParams.signature = crypto
      .createHmac('sha1', process.env.IMAGEKIT_PRIVATE_KEY)
      .update(stringToSign)
      .digest('hex');
    
    res.json(authParams);
  } catch (error) {
    console.error('ImageKit auth error:', error);
    res.status(500).json({ 
      error: 'Failed to generate authentication parameters',
      message: error.message 
    });
  }
});

/**
 * Server-side image upload endpoint
 */
router.post('/upload', async (req, res) => {
  console.log('📤 Upload endpoint hit');
  
  try {
    // Check if ImageKit is properly initialized
    if (!imagekit) {
      console.error('❌ ImageKit not initialized');
      return res.status(500).json({ 
        error: 'ImageKit service not available',
        message: 'Image upload service is not properly configured' 
      });
    }

    if (typeof imagekit.files?.upload !== 'function') {
      console.error('❌ ImageKit upload method not available');
      return res.status(500).json({ 
        error: 'ImageKit upload method not available',
        message: 'Image upload functionality is not working' 
      });
    }

    const { file, fileName, folder, tags } = req.body;

    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Check file size (base64 length approximation)
    const fileSizeApprox = file.length * 0.75; // base64 is ~33% larger than binary
    const maxSize = 10 * 1024 * 1024; // 10MB limit
    
    if (fileSizeApprox > maxSize) {
      return res.status(400).json({ 
        error: 'File too large',
        message: `File size (${Math.round(fileSizeApprox / 1024 / 1024)}MB) exceeds maximum allowed size (10MB)` 
      });
    }

    const uploadOptions = {
      file: file, // base64 string
      fileName: fileName || `upload_${Date.now()}`,
      folder: folder || 'uploads',
      useUniqueFileName: true,
      tags: tags || []
    };

    console.log(`📤 Uploading image: ${uploadOptions.fileName} to folder: ${uploadOptions.folder}`);
    
    const result = await imagekit.files.upload(uploadOptions);
    console.log(`✅ Image uploaded successfully: ${result.fileId}`);

    res.json({
      success: true,
      fileId: result.fileId,
      url: result.url,
      thumbnailUrl: result.thumbnailUrl,
      name: result.name,
      size: result.size,
      filePath: result.filePath
    });

  } catch (error) {
    console.error('❌ ImageKit server upload error:', error.message);
    console.error('Error stack:', error.stack);
    
    res.status(500).json({ 
      error: 'Failed to upload image',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Delete image endpoint (with fileId in body)
 */
router.delete('/delete', async (req, res) => {
  console.log('🗑️ Delete endpoint hit (body method)');
  
  try {
    // Check if ImageKit is properly initialized
    if (!imagekit) {
      console.error('❌ ImageKit not initialized');
      return res.status(500).json({ 
        error: 'ImageKit service not available',
        message: 'Image delete service is not properly configured' 
      });
    }

    if (typeof imagekit.files?.delete !== 'function') {
      console.error('❌ ImageKit delete method not available');
      return res.status(500).json({ 
        error: 'ImageKit delete method not available',
        message: 'Image delete functionality is not working' 
      });
    }

    const { fileId } = req.body;

    if (!fileId) {
      return res.status(400).json({ error: 'File ID is required' });
    }

    console.log(`🗑️ Deleting image from ImageKit: ${fileId}`);
    await imagekit.files.delete(fileId);
    console.log(`✅ Image deleted successfully: ${fileId}`);

    res.json({
      success: true,
      message: 'Image deleted successfully',
      fileId: fileId
    });

  } catch (error) {
    console.error('❌ ImageKit delete error:', error.message);
    
    // Handle specific ImageKit errors
    if (error.message && error.message.includes('No such file')) {
      return res.status(404).json({ 
        error: 'Image not found',
        message: 'The image may have already been deleted or does not exist'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to delete image',
      message: error.message 
    });
  }
});

/**
 * Delete image endpoint (with fileId in URL parameter)
 */
router.delete('/delete/:fileId', async (req, res) => {
  console.log('🗑️ Delete endpoint hit');
  
  try {
    // Check if ImageKit is properly initialized
    if (!imagekit) {
      console.error('❌ ImageKit not initialized');
      return res.status(500).json({ 
        error: 'ImageKit service not available',
        message: 'Image delete service is not properly configured' 
      });
    }

    if (typeof imagekit.files?.delete !== 'function') {
      console.error('❌ ImageKit delete method not available');
      return res.status(500).json({ 
        error: 'ImageKit delete method not available',
        message: 'Image delete functionality is not working' 
      });
    }

    const { fileId } = req.params;

    if (!fileId) {
      return res.status(400).json({ error: 'File ID is required' });
    }

    console.log(`🗑️ Deleting image from ImageKit: ${fileId}`);
    await imagekit.files.delete(fileId);
    console.log(`✅ Image deleted successfully: ${fileId}`);

    res.json({
      success: true,
      message: 'Image deleted successfully',
      fileId: fileId
    });

  } catch (error) {
    console.error('❌ ImageKit delete error:', error.message);
    
    // Handle specific ImageKit errors
    if (error.message && error.message.includes('No such file')) {
      return res.status(404).json({ 
        error: 'Image not found',
        message: 'The image may have already been deleted or does not exist'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to delete image',
      message: error.message 
    });
  }
});

/**
 * Get file details endpoint
 */
router.get('/file/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;

    if (!fileId) {
      return res.status(400).json({ error: 'File ID is required' });
    }

    const fileDetails = await imagekit.getFileDetails(fileId);

    res.json({
      success: true,
      file: fileDetails
    });

  } catch (error) {
    console.error('ImageKit get file error:', error);
    res.status(500).json({ 
      error: 'Failed to get file details',
      message: error.message 
    });
  }
});

module.exports = router;