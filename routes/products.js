const express = require('express');
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Product = require('../models/Product');
const Campaign = require('../models/Campaign');
const router = express.Router();

// Helper: attach active campaign info to a product object
const attachCampaign = (product, campaigns) => {
  const pid = product._id?.toString();
  const cat = product.category;
  // After populate, sellerId is an object — always extract _id
  const sid = (product.sellerId?._id || product.sellerId)?.toString();

  const match = campaigns.find(c => {
    if (c.sellerId?.toString() !== sid) return false;
    // status already filtered to 'active' in query, but double-check
    if (c.status !== 'active') return false;
    if (c.appliesTo === 'all_products') return true;
    if (c.appliesTo === 'specific_categories') return c.categories?.includes(cat);
    if (c.appliesTo === 'specific_products')
      return c.productIds?.map(id => id.toString()).includes(pid);
    return false;
  });

  if (!match) return product;

  const basePrice = product.salePrice || 0;
  let campaignPrice = basePrice;
  if (match.type !== 'free_shipping') {
    if (match.discountType === 'percentage') {
      campaignPrice = basePrice - (basePrice * match.discountValue / 100);
    } else {
      campaignPrice = basePrice - match.discountValue;
    }
    campaignPrice = Math.max(0, Math.round(campaignPrice));
  }

  const plain = product.toObject ? product.toObject() : { ...product };
  return {
    ...plain,
    campaign: {
      id:            match._id,
      title:         match.title,
      type:          match.type,
      discountType:  match.discountType,
      discountValue: match.discountValue,
      couponCode:    match.couponCode || null,
      bannerColor:   match.bannerColor,
      endDate:       match.endDate,
    },
    campaignPrice,
    hasCampaign: true,
  };
};

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv' // .csv
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only Excel and CSV files are allowed.'));
    }
  }
});

// Get all products (public)
// Helper: normalize a product document to the shape the frontend card expects
const normalizeProduct = (p) => {
  const obj = p.toObject ? p.toObject() : { ...p };
  const seller = obj.sellerId;
  return {
    ...obj,
    id: obj._id?.toString(),
    sale_price: obj.salePrice,
    regular_price: obj.regularPrice,
    Shop: {
      id: seller?._id?.toString() || '',
      name: seller?.shop?.shopName || seller?.shopName || '',
    },
    // keep originals too for compatibility
    salePrice: obj.salePrice,
    regularPrice: obj.regularPrice,
  };
};

router.get('/', async (req, res) => {
  try {
    const {
      category, subCategory, sellerId, status = 'active',
      q, brand, colors, sizes,
      price_gte, price_lte, rating_gte,
      sortBy = 'createdAt', sortOrder = 'desc',
      page = 1, limit = 12,
    } = req.query;

    const filter = { status };
    if (category)    filter.category = category;
    if (subCategory) filter.subCategory = subCategory;
    if (sellerId)    filter.sellerId = sellerId;
    if (brand)       filter.brand = { $regex: brand, $options: 'i' };
    if (colors)      filter.colors = { $in: colors.split(',') };
    if (sizes)       filter.sizes = { $in: sizes.split(',') };
    if (price_gte || price_lte) {
      filter.salePrice = {};
      if (price_gte) filter.salePrice.$gte = Number(price_gte);
      if (price_lte) filter.salePrice.$lte = Number(price_lte);
    }
    if (q) {
      filter.$or = [
        { title: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { tags: { $regex: q, $options: 'i' } },
        { brand: { $regex: q, $options: 'i' } },
      ];
    }

    const sortMap = {
      price: 'salePrice', createdAt: 'createdAt',
      title: 'title', stock: 'stock',
    };
    const sortField = sortMap[sortBy] || 'createdAt';
    const sortDir = sortOrder === 'asc' ? 1 : -1;

    const skip = (Number(page) - 1) * Number(limit);
    const total = await Product.countDocuments(filter);

    const products = await Product.find(filter)
      .populate('sellerId', 'shop.shopName shopName email phoneNumber verified')
      .sort({ [sortField]: sortDir })
      .skip(skip)
      .limit(Number(limit));

    const now = new Date();
    const campaigns = await Campaign.find({ status: 'active', startDate: { $lte: now }, endDate: { $gte: now } });

    const enriched = products.map(p => {
      const withCampaign = attachCampaign(p, campaigns);
      return normalizeProduct(withCampaign);
    });

    res.json({
      success: true,
      products: enriched,
      count: enriched.length,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch products', error: error.message });
  }
});

// Get latest product updatedAt timestamp (used by frontend cache invalidation)
router.get('/latest-update', async (req, res) => {
  try {
    const latest = await Product.findOne({ status: 'active' })
      .sort({ updatedAt: -1 })
      .select('updatedAt')
      .lean();
    res.json({ success: true, lastUpdated: latest?.updatedAt || null });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get latest update', error: error.message });
  }
});

// Get categories (with subCategories grouped)
router.get('/categories', async (req, res) => {
  try {
    const categories = await Product.distinct('category', { status: 'active' });
    const subCategoryDocs = await Product.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: { category: '$category', subCategory: '$subCategory' } } },
    ]);

    const subCategories = {};
    subCategoryDocs.forEach(({ _id }) => {
      if (!_id.category) return;
      if (!subCategories[_id.category]) subCategories[_id.category] = [];
      if (_id.subCategory) subCategories[_id.category].push(_id.subCategory);
    });

    res.json({ success: true, categories: categories.filter(Boolean), subCategories });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch categories', error: error.message });
  }
});

// GET /api/products/recommendations — must be before /:id
router.get('/recommendations', async (req, res) => {
  try {
    const { categories, excludeIds, limit = 8 } = req.query;
    const filter = { status: 'active', isDraft: { $ne: true } };

    if (categories) {
      filter.category = { $in: categories.split(',').map(c => c.trim()).filter(Boolean) };
    }
    if (excludeIds) {
      const ids = excludeIds.split(',').map(id => id.trim()).filter(id => id.match(/^[a-f\d]{24}$/i));
      if (ids.length) filter._id = { $nin: ids };
    }

    const products = await Product.find(filter)
      .select('title slug salePrice regularPrice images category ratings _id')
      .sort({ ratings: -1, createdAt: -1 })
      .limit(Math.min(parseInt(limit) || 8, 20))
      .lean();

    res.json({
      success: true,
      products: products.map(p => ({
        id: p._id,
        title: p.title,
        slug: p.slug || p._id,
        sale_price: p.salePrice || 0,
        regular_price: p.regularPrice || 0,
        images: p.images || [],
        category: p.category || '',
        ratings: p.ratings || 0,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get single product
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('sellerId', 'shop.shopName shopName email phoneNumber verified');
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const now = new Date();
    const campaigns = await Campaign.find({
      sellerId: product.sellerId?._id || product.sellerId,
      status: 'active', startDate: { $lte: now }, endDate: { $gte: now },
    });
    const enriched = normalizeProduct(attachCampaign(product, campaigns));

    res.json({ success: true, product: enriched });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch product', error: error.message });
  }
});

// Create product (seller)
router.post('/', async (req, res) => {
  try {
    const productData = req.body;
    
    console.log('📦 Received product creation request');
    console.log('📋 Request body keys:', Object.keys(productData));
    
    // Check payload size to prevent MongoDB document size limit issues
    const payloadSize = JSON.stringify(productData).length;
    console.log('📏 Payload size:', payloadSize, 'bytes');
    
    if (payloadSize > 15 * 1024 * 1024) { // 15MB limit (MongoDB limit is 16MB)
      console.log('❌ Payload too large:', payloadSize);
      return res.status(400).json({
        success: false,
        message: 'Product data is too large. Please ensure images are uploaded to ImageKit first.',
        error: 'Payload exceeds size limit'
      });
    }
    
    // Validate that images don't contain base64 data
    if (productData.images && Array.isArray(productData.images)) {
      for (let i = 0; i < productData.images.length; i++) {
        const image = productData.images[i];
        if (image.base64 && image.base64.length > 1000) {
          console.log('❌ Image contains large base64 data');
          return res.status(400).json({
            success: false,
            message: 'Images must be uploaded to ImageKit first. Base64 data not allowed in product creation.',
            error: 'Large base64 data detected'
          });
        }
      }
    }
    
    console.log('📋 Product data summary:', {
      title: productData.title,
      category: productData.category,
      imagesCount: productData.images?.length || 0,
      sellerId: productData.sellerId
    });
    
    // For now, we'll get sellerId from the request body
    // In a real app, this would come from authentication middleware
    if (!productData.sellerId) {
      console.log('❌ Missing sellerId');
      return res.status(400).json({
        success: false,
        message: 'Seller ID is required'
      });
    }

    // Validate required fields
    const requiredFields = ['title', 'description', 'category', 'subCategory', 'regularPrice', 'salePrice', 'stock'];
    const missingFields = requiredFields.filter(field => !productData[field]);
    
    if (missingFields.length > 0) {
      console.log('❌ Missing required fields:', missingFields);
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // Validate images
    if (!productData.images || productData.images.length === 0) {
      console.log('❌ No images provided');
      return res.status(400).json({
        success: false,
        message: 'At least one image is required'
      });
    }

    // Validate prices
    if (parseFloat(productData.salePrice) >= parseFloat(productData.regularPrice)) {
      console.log('❌ Invalid price relationship');
      return res.status(400).json({
        success: false,
        message: 'Sale price must be less than regular price'
      });
    }

    console.log('✅ All validations passed, creating product...');

    // Debug: Log the exact image data being saved
    console.log('🔍 Image data being saved to database:');
    productData.images.forEach((img, index) => {
      console.log(`Image ${index + 1}:`, {
        url: img.url,
        fileId: img.fileId,
        thumbnailUrl: img.thumbnailUrl,
        fileName: img.fileName,
        uploaded: img.uploaded
      });
    });

    const product = new Product({
      ...productData,
      status: 'active',
      isDraft: false
    });

    // Inherit seller's payment methods
    try {
      const Seller = require('../models/Seller');
      const seller = await Seller.findById(productData.sellerId).select('payment');
      if (seller?.payment) {
        product.paymentMethods = {
          mtnName: seller.payment.mtnName || '',
          mtnNumber: seller.payment.mtnNumber || '',
          airtelName: seller.payment.airtelName || '',
          airtelNumber: seller.payment.airtelNumber || '',
          bankName: seller.payment.bankName || '',
          bankAccountName: seller.payment.bankAccountName || '',
          bankAccountNumber: seller.payment.bankAccountNumber || '',
          bankBranch: seller.payment.bankBranch || '',
          preferredMethod: seller.payment.preferredMethod || '',
        };
      }
    } catch (e) { console.log('Could not inherit payment methods:', e.message); }
    
    console.log('📦 Product object created, saving to database...');
    
    // Debug: Log the product object before saving
    console.log('🔍 Product object images before save:');
    product.images.forEach((img, index) => {
      console.log(`Product Image ${index + 1}:`, {
        url: img.url,
        fileId: img.fileId,
        thumbnailUrl: img.thumbnailUrl,
        fileName: img.fileName,
        uploaded: img.uploaded
      });
    });
    
    const savedProduct = await product.save();
    
    console.log('✅ Product created successfully:', savedProduct._id);
    
    // Debug: Log the saved product images
    console.log('🔍 Saved product images in database:');
    savedProduct.images.forEach((img, index) => {
      console.log(`Saved Image ${index + 1}:`, {
        url: img.url,
        fileId: img.fileId,
        thumbnailUrl: img.thumbnailUrl,
        fileName: img.fileName,
        uploaded: img.uploaded,
        _id: img._id
      });
    });
    
    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      product: savedProduct
    });
  } catch (error) {
    console.error('❌ Error creating product:', error);
    console.error('❌ Error name:', error.name);
    console.error('❌ Error message:', error.message);
    
    // Handle Mongoose validation errors specifically
    if (error.name === 'ValidationError') {
      const validationErrors = Object.keys(error.errors).map(key => {
        return `${key}: ${error.errors[key].message}`;
      });
      console.error('❌ Validation errors:', validationErrors);
      
      return res.status(400).json({ 
        success: false,
        message: `Product validation failed: ${validationErrors.join(', ')}`,
        errors: error.errors
      });
    }
    
    res.status(400).json({ 
      success: false,
      message: 'Failed to create product',
      error: error.message 
    });
  }
});

// Create draft product (seller)
router.post('/draft', async (req, res) => {
  try {
    const draftData = req.body;
    
    console.log('📝 Received draft creation request');
    console.log('📋 Draft data summary:', {
      title: draftData.title,
      category: draftData.category,
      imagesCount: draftData.images?.length || 0,
      sellerId: draftData.sellerId
    });
    
    // For drafts, only require title and sellerId
    if (!draftData.title || !draftData.sellerId) {
      return res.status(400).json({
        success: false,
        message: 'Title and Seller ID are required for drafts'
      });
    }

    const draft = new Product({
      ...draftData,
      status: 'draft',
      isDraft: true
    });
    
    const savedDraft = await draft.save();
    
    console.log('✅ Draft saved successfully:', savedDraft._id);
    
    res.status(201).json({
      success: true,
      message: 'Draft saved successfully',
      draft: savedDraft
    });
  } catch (error) {
    console.error('❌ Error saving draft:', error);
    res.status(400).json({ 
      success: false,
      message: 'Failed to save draft',
      error: error.message 
    });
  }
});

// Get products by seller
router.get('/seller/:sellerId', async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { status = 'active' } = req.query;
    
    const products = await Product.find({ 
      sellerId,
      status 
    }).sort({ createdAt: -1 });
    
    res.json({
      success: true,
      products,
      count: products.length
    });
  } catch (error) {
    console.error('Error fetching seller products:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch seller products',
      error: error.message 
    });
  }
});

// Update product
router.put('/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!product) {
      return res.status(404).json({ 
        success: false,
        message: 'Product not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Product updated successfully',
      product
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(400).json({ 
      success: false,
      message: 'Failed to update product',
      error: error.message 
    });
  }
});

// Delete product
router.delete('/:id', async (req, res) => {
  try {
    console.log('🗑️ Delete product request for ID:', req.params.id);
    
    // First, find the product to get its details before deletion
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      console.log('❌ Product not found for deletion:', req.params.id);
      return res.status(404).json({ 
        success: false,
        message: 'Product not found' 
      });
    }
    
    console.log('📋 Product to delete:', {
      id: product._id,
      title: product.title,
      sellerId: product.sellerId,
      imagesCount: product.images?.length || 0
    });
    
    // Log images that will be orphaned (frontend handles ImageKit deletion)
    if (product.images && product.images.length > 0) {
      const imagesToCleanup = product.images.filter(img => img.fileId || img.imagekitFileId);
      console.log('📸 Images associated with product (should be cleaned up by frontend):', 
        imagesToCleanup.map(img => ({
          fileId: img.fileId || img.imagekitFileId,
          fileName: img.fileName
        }))
      );
    }
    
    // Delete the product from database
    await Product.findByIdAndDelete(req.params.id);
    
    console.log('✅ Product deleted successfully from database:', product.title);
    
    res.json({ 
      success: true,
      message: 'Product deleted successfully',
      deletedProduct: {
        id: product._id,
        title: product.title,
        imagesCount: product.images?.length || 0
      }
    });
  } catch (error) {
    console.error('❌ Error deleting product:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to delete product',
      error: error.message 
    });
  }
});

// Get product statistics
router.get('/stats/:sellerId', async (req, res) => {
  try {
    const { sellerId } = req.params;
    
    const stats = await Product.aggregate([
      { $match: { sellerId: new mongoose.Types.ObjectId(sellerId) } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalValue: { $sum: '$salePrice' }
        }
      }
    ]);
    
    const totalProducts = await Product.countDocuments({ sellerId });
    
    res.json({
      success: true,
      stats: {
        total: totalProducts,
        byStatus: stats,
        totalValue: stats.reduce((sum, stat) => sum + stat.totalValue, 0)
      }
    });
  } catch (error) {
    console.error('Error fetching product stats:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch product statistics',
      error: error.message 
    });
  }
});

// Bulk Upload Routes

// Parse bulk upload file
router.post('/bulk-upload/parse', upload.single('file'), async (req, res) => {
  try {
    console.log('Bulk upload parse request received');
    console.log('Request headers:', req.headers);
    console.log('File info:', req.file ? {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path
    } : 'No file received');

    if (!req.file) {
      console.error('No file uploaded in request');
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    console.log('Parsing uploaded file:', req.file.originalname);
    
    const filePath = req.file.path;
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    
    let headers = [];
    let data = [];
    
    if (fileExtension === '.csv') {
      // Parse CSV file with proper quote handling
      const csvData = fs.readFileSync(filePath, 'utf8');
      const lines = csvData.split('\n').filter(line => line.trim());
      
      // Function to parse CSV line with proper quote handling
      const parseCSVLine = (line) => {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        
        result.push(current.trim());
        return result;
      };
      
      if (lines.length > 0) {
        // Extract headers from first line
        headers = parseCSVLine(lines[0]);
        
        // Parse data rows
        for (let i = 1; i < Math.min(lines.length, 101); i++) { // Limit to 100 rows for preview
          const values = parseCSVLine(lines[i]);
          const row = {};
          headers.forEach((header, index) => {
            row[header] = values[index] || '';
          });
          
          // Only add row if it has some data
          if (Object.values(row).some(value => value.trim() !== '')) {
            data.push(row);
          }
        }
      }
    } else if (fileExtension === '.xlsx' || fileExtension === '.xls') {
      // Parse Excel file
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      
      const worksheet = workbook.getWorksheet(1); // Get first worksheet
      
      if (worksheet) {
        // Extract headers from first row
        const headerRow = worksheet.getRow(1);
        headers = [];
        headerRow.eachCell((cell, colNumber) => {
          headers.push(cell.text || cell.value?.toString() || '');
        });
        
        // Parse data rows (limit to 100 rows for preview)
        const maxRows = Math.min(worksheet.rowCount, 101);
        for (let rowNumber = 2; rowNumber <= maxRows; rowNumber++) {
          const row = {};
          const dataRow = worksheet.getRow(rowNumber);
          
          headers.forEach((header, index) => {
            const cell = dataRow.getCell(index + 1);
            row[header] = cell.text || cell.value?.toString() || '';
          });
          
          // Only add row if it has some data
          if (Object.values(row).some(value => value.trim() !== '')) {
            data.push(row);
          }
        }
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'Unsupported file format. Please use CSV, XLS, or XLSX files.'
      });
    }
    
    // Clean up uploaded file
    fs.unlinkSync(filePath);
    
    console.log(`Parsed file successfully: ${headers.length} headers, ${data.length} rows`);
    console.log('Headers:', headers);
    
    res.json({
      success: true,
      headers: headers,
      data: data,
      totalRows: data.length
    });
    
  } catch (error) {
    console.error('Error parsing bulk upload file:', error);
    
    // Clean up file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to parse file',
      error: error.message
    });
  }
});

// Simple seller auth middleware for bulk upload
const authenticateSeller = async (req, res, next) => {
  try {
    // For now, we'll get sellerId from request body
    // In a production app, this would come from JWT token
    const { sellerId } = req.body;
    
    if (!sellerId) {
      return res.status(401).json({
        success: false,
        message: 'Seller authentication required',
        error: 'Seller ID is required for bulk upload'
      });
    }

    // Verify seller exists and is active
    const Seller = require('../models/Seller');
    const seller = await Seller.findById(sellerId);
    
    if (!seller) {
      return res.status(401).json({
        success: false,
        message: 'Invalid seller',
        error: 'Seller not found'
      });
    }

    if (!seller.verified || seller.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: 'Seller account not active',
        error: 'Please verify your seller account'
      });
    }

    req.seller = seller;
    next();
  } catch (error) {
    console.error('Seller authentication error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication failed',
      error: error.message
    });
  }
};

// Process bulk upload
router.post('/bulk-upload/process', authenticateSeller, async (req, res) => {
  try {
    const { products, batchNumber, totalBatches } = req.body;
    const sellerId = req.seller._id; // Get from authenticated seller
    
    console.log(`Processing batch ${batchNumber}/${totalBatches} with ${products.length} products for seller: ${req.seller.name}`);
    
    if (!products || !Array.isArray(products)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid products data'
      });
    }

    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    // Process each product in the batch
    for (let i = 0; i < products.length; i++) {
      const productData = products[i];
      
      try {
        // Validate required fields
        if (!productData.title || !productData.sku || !productData.salePrice) {
          throw new Error('Missing required fields: title, sku, or salePrice');
        }

        // Create new product with authenticated seller ID
        const product = new Product({
          title: productData.title,
          description: productData.description || '',
          detailedDescription: productData.detailedDescription || '',
          regularPrice: parseFloat(productData.regularPrice) || parseFloat(productData.salePrice),
          salePrice: parseFloat(productData.salePrice),
          stock: parseInt(productData.stock) || 0,
          category: productData.category || 'General',
          subCategory: productData.subCategory || 'General',
          brand: productData.brand || '',
          colors: productData.colors ? productData.colors.split(',').map(c => c.trim()) : [],
          sizes: productData.sizes ? productData.sizes.split(',').map(s => s.trim()) : [],
          tags: productData.tags || '', // Keep as string, not array
          warranty: productData.warranty || '',
          images: productData.images ? productData.images.split(',').map(img => ({
            url: img.trim(),
            uploaded: false
          })) : [],
          videoUrl: productData.videoUrl || '',
          cashOnDelivery: (productData.cashOnDelivery === 'Yes' || productData.cashOnDelivery === 'true' || productData.cashOnDelivery === true) ? 'Yes' : 'No',
          currency: productData.currency || 'UGX',
          status: 'active',
          sellerId: sellerId, // Use authenticated seller ID
          createdAt: new Date(),
          updatedAt: new Date()
        });

        // Inherit seller's payment methods
        try {
          const Seller = require('../models/Seller');
          const seller = await Seller.findById(sellerId).select('payment');
          if (seller?.payment) {
            product.paymentMethods = {
              mtnName: seller.payment.mtnName || '',
              mtnNumber: seller.payment.mtnNumber || '',
              airtelName: seller.payment.airtelName || '',
              airtelNumber: seller.payment.airtelNumber || '',
              bankName: seller.payment.bankName || '',
              bankAccountName: seller.payment.bankAccountName || '',
              bankAccountNumber: seller.payment.bankAccountNumber || '',
              bankBranch: seller.payment.bankBranch || '',
              preferredMethod: seller.payment.preferredMethod || '',
            };
          }
        } catch (e) { /* silent */ }

        await product.save();
        results.success++;
        
        console.log(`Product ${i + 1} saved: ${product.title} (Seller: ${req.seller.name})`);
        
      } catch (error) {
        console.error(`Error saving product ${i + 1}:`, error);
        results.failed++;
        results.errors.push({
          product: productData.title || `Product ${i + 1}`,
          error: error.message
        });
      }
    }

    console.log(`Batch ${batchNumber} completed for seller ${req.seller.name}: ${results.success} success, ${results.failed} failed`);

    res.json({
      success: true,
      batchNumber,
      totalBatches,
      results,
      seller: {
        id: req.seller._id,
        name: req.seller.name
      }
    });

  } catch (error) {
    console.error('Error processing bulk upload:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process bulk upload',
      error: error.message
    });
  }
});

// Download template
router.get('/bulk-upload/template/:type', async (req, res) => {
  try {
    const { type } = req.params; // 'blank' or 'existing'
    
    // Validate template type
    if (!['blank', 'existing'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid template type. Must be "blank" or "existing"'
      });
    }
    
    console.log(`Generating ${type} template...`);
    
    // Create a new workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Products');
    
    // Define the columns
    const columns = [
      { header: 'Product Name', key: 'title', width: 30 },
      { header: 'SKU', key: 'sku', width: 15 },
      { header: 'Short Description', key: 'description', width: 40 },
      { header: 'Detailed Description', key: 'detailedDescription', width: 50 },
      { header: 'Regular Price', key: 'regularPrice', width: 15 },
      { header: 'Sale Price', key: 'salePrice', width: 15 },
      { header: 'Stock', key: 'stock', width: 10 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Sub Category', key: 'subCategory', width: 20 },
      { header: 'Brand', key: 'brand', width: 15 },
      { header: 'Colors', key: 'colors', width: 20 },
      { header: 'Sizes', key: 'sizes', width: 20 },
      { header: 'Tags', key: 'tags', width: 30 },
      { header: 'Warranty', key: 'warranty', width: 15 },
      { header: 'Image URLs', key: 'images', width: 50 },
      { header: 'Video URL', key: 'videoUrl', width: 30 },
      { header: 'Cash on Delivery', key: 'cashOnDelivery', width: 15 },
      { header: 'Currency', key: 'currency', width: 10 }
    ];
    
    worksheet.columns = columns;
    
    // Style the header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE3F2FD' }
    };
    
    // Add data validation and comments for important fields
    worksheet.getCell('A2').note = 'Required: Enter the product name';
    worksheet.getCell('B2').note = 'Required: Enter unique SKU code';
    worksheet.getCell('C2').note = 'Required: Brief product description';
    worksheet.getCell('E2').note = 'Required: Enter price in UGX (numbers only)';
    worksheet.getCell('F2').note = 'Required: Enter sale price in UGX (numbers only)';
    worksheet.getCell('G2').note = 'Required: Enter stock quantity (numbers only)';
    worksheet.getCell('H2').note = 'Required: Enter product category';
    worksheet.getCell('K2').note = 'Optional: Comma-separated colors (e.g., Red, Blue, Green)';
    worksheet.getCell('L2').note = 'Optional: Comma-separated sizes (e.g., S, M, L, XL)';
    worksheet.getCell('M2').note = 'Optional: Comma-separated tags for SEO';
    worksheet.getCell('O2').note = 'Optional: Comma-separated image URLs';
    worksheet.getCell('Q2').note = 'Enter Yes or No';
    worksheet.getCell('R2').note = 'Enter UGX for Ugandan Shillings';
    
    if (type === 'existing') {
      // If type is 'existing', we would populate with seller's products
      // For now, add sample data
      const sampleData = [
        {
          title: 'Sample Product 1',
          sku: 'SKU001',
          description: 'This is a sample product description',
          detailedDescription: 'This is a detailed description of the sample product with more information about features and benefits.',
          regularPrice: 50000,
          salePrice: 45000,
          stock: 100,
          category: 'Electronics',
          subCategory: 'Phones',
          brand: 'Sample Brand',
          colors: 'Black, White, Blue',
          sizes: 'One Size',
          tags: 'electronics, phone, mobile, smartphone',
          warranty: '1 Year',
          images: 'https://example.com/image1.jpg, https://example.com/image2.jpg',
          videoUrl: 'https://example.com/video.mp4',
          cashOnDelivery: 'Yes',
          currency: 'UGX'
        },
        {
          title: 'Sample Product 2',
          sku: 'SKU002',
          description: 'Another sample product',
          detailedDescription: 'Detailed description for the second sample product.',
          regularPrice: 75000,
          salePrice: 70000,
          stock: 50,
          category: 'Fashion',
          subCategory: 'Clothing',
          brand: 'Fashion Brand',
          colors: 'Red, Green, Yellow',
          sizes: 'S, M, L, XL',
          tags: 'fashion, clothing, style',
          warranty: '6 Months',
          images: 'https://example.com/image3.jpg',
          videoUrl: '',
          cashOnDelivery: 'No',
          currency: 'UGX'
        }
      ];
      
      worksheet.addRows(sampleData);
    } else {
      // For blank template, add one empty row with sample format
      worksheet.addRow({
        title: 'Example: iPhone 15 Pro',
        sku: 'IP15P001',
        description: 'Latest iPhone with advanced features',
        detailedDescription: 'The iPhone 15 Pro features a titanium design, advanced camera system, and powerful A17 Pro chip.',
        regularPrice: 3500000,
        salePrice: 3200000,
        stock: 25,
        category: 'Electronics',
        subCategory: 'Phones',
        brand: 'Apple',
        colors: 'Natural Titanium, Blue Titanium, White Titanium, Black Titanium',
        sizes: '128GB, 256GB, 512GB, 1TB',
        tags: 'iphone, apple, smartphone, premium, titanium',
        warranty: '1 Year',
        images: 'https://example.com/iphone1.jpg, https://example.com/iphone2.jpg, https://example.com/iphone3.jpg',
        videoUrl: 'https://example.com/iphone-video.mp4',
        cashOnDelivery: 'Yes',
        currency: 'UGX'
      });
      
      // Make the example row a different color
      worksheet.getRow(2).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFEF7E0' }
      };
      
      // Add a note about the example row
      worksheet.getCell('A3').value = 'Delete the example row above and add your products starting from this row';
      worksheet.getCell('A3').font = { italic: true, color: { argb: 'FF666666' } };
    }
    
    // Set response headers for file download
    const fileName = `product_${type}_template.xlsx`;
    console.log(`Setting headers for file: ${fileName}`);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    
    console.log('Writing workbook to response...');
    
    // Write the workbook to response
    await workbook.xlsx.write(res);
    res.end();
    
    console.log(`Template ${type} generated and sent successfully`);
    
  } catch (error) {
    console.error('Error generating template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate template',
      error: error.message
    });
  }
});

// Get import history
router.get('/bulk-upload/history', async (req, res) => {
  try {
    // This is a placeholder - in a real implementation, you would:
    // 1. Fetch import logs from database
    // 2. Return paginated results
    
    const mockLogs = [
      {
        id: '1',
        fileName: 'products_import_2024.xlsx',
        totalProducts: 150,
        importedCount: 145,
        failedCount: 5,
        status: 'completed',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      },
      {
        id: '2',
        fileName: 'electronics_batch.csv',
        totalProducts: 75,
        importedCount: 60,
        failedCount: 15,
        status: 'partial',
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        completedAt: new Date(Date.now() - 86400000).toISOString()
      }
    ];

    res.json({
      success: true,
      logs: mockLogs
    });
  } catch (error) {
    console.error('Error fetching import history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch import history',
      error: error.message
    });
  }
});

// Download import report
router.get('/bulk-upload/report/:batchId', async (req, res) => {
  try {
    const { batchId } = req.params;
    
    // This is a placeholder - in a real implementation, you would:
    // 1. Generate CSV/Excel report for the batch
    // 2. Include success/failure details
    // 3. Return file for download
    
    res.json({
      success: true,
      message: `Report for batch ${batchId} prepared for download`
    });
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate report',
      error: error.message
    });
  }
});

// Bulk Edit Routes

// Bulk edit products
router.post('/bulk-edit', async (req, res) => {
  try {
    const { action, productIds, value, actionType, isPercentage } = req.body;

    if (!action || !productIds || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Action and product IDs are required'
      });
    }

    let updateQuery = {};
    let successCount = 0;

    switch (action) {
      case 'price':
        if (actionType === 'set') {
          updateQuery.salePrice = value;
        } else {
          // For increase/decrease, we need to update each product individually
          const products = await Product.find({ _id: { $in: productIds } });
          
          for (const product of products) {
            let newPrice = product.salePrice || 0;
            
            if (isPercentage) {
              if (actionType === 'increase') {
                newPrice = newPrice * (1 + value / 100);
              } else if (actionType === 'decrease') {
                newPrice = newPrice * (1 - value / 100);
              }
            } else {
              if (actionType === 'increase') {
                newPrice += value;
              } else if (actionType === 'decrease') {
                newPrice -= value;
              }
            }
            
            await Product.findByIdAndUpdate(product._id, { salePrice: Math.max(0, newPrice) });
            successCount++;
          }
          
          return res.json({
            success: true,
            message: `Successfully updated prices for ${successCount} products`
          });
        }
        break;

      case 'stock':
        if (actionType === 'set') {
          updateQuery.stock = value;
        } else {
          const products = await Product.find({ _id: { $in: productIds } });
          
          for (const product of products) {
            let newStock = product.stock || 0;
            
            if (actionType === 'increase') {
              newStock += value;
            } else if (actionType === 'decrease') {
              newStock -= value;
            }
            
            await Product.findByIdAndUpdate(product._id, { stock: Math.max(0, newStock) });
            successCount++;
          }
          
          return res.json({
            success: true,
            message: `Successfully updated stock for ${successCount} products`
          });
        }
        break;

      case 'category':
        updateQuery.category = value;
        break;

      case 'discount':
        const products = await Product.find({ _id: { $in: productIds } });
        
        for (const product of products) {
          let newPrice = product.salePrice || 0;
          
          if (isPercentage) {
            newPrice = newPrice * (1 - value / 100);
          } else {
            newPrice -= value;
          }
          
          await Product.findByIdAndUpdate(product._id, { salePrice: Math.max(0, newPrice) });
          successCount++;
        }
        
        return res.json({
          success: true,
          message: `Successfully applied discount to ${successCount} products`
        });

      case 'delete':
        const deleteResult = await Product.deleteMany({ _id: { $in: productIds } });
        
        return res.json({
          success: true,
          message: `Successfully deleted ${deleteResult.deletedCount} products`
        });

      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid action type'
        });
    }

    // For simple update operations
    if (Object.keys(updateQuery).length > 0) {
      const result = await Product.updateMany(
        { _id: { $in: productIds } },
        { $set: updateQuery }
      );
      
      res.json({
        success: true,
        message: `Successfully updated ${result.modifiedCount} products`
      });
    }

  } catch (error) {
    console.error('Error in bulk edit:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to perform bulk action',
      error: error.message
    });
  }
});

// Export products
router.post('/bulk-export', async (req, res) => {
  try {
    const { productIds } = req.body;

    if (!productIds || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Product IDs are required'
      });
    }

    // This is a placeholder - in a real implementation, you would:
    // 1. Fetch the selected products
    // 2. Generate Excel/CSV file
    // 3. Return file for download
    
    res.json({
      success: true,
      message: `Export prepared for ${productIds.length} products`
    });
  } catch (error) {
    console.error('Error exporting products:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export products',
      error: error.message
    });
  }
});

// Get related products based on category and subcategory
router.get('/:id/related', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 6 } = req.query;
    
    // First, get the current product to know its category and subcategory
    const currentProduct = await Product.findById(id);
    
    if (!currentProduct) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    // Get all active products except the current one
    const allProducts = await Product.find({
      status: 'active',
      stock: { $gt: 0 }
    }).populate('sellerId', 'shop.shopName email phoneNumber verified').lean();
    
    // Filter out the current product after fetching
    const filteredProducts = allProducts.filter(product => product._id.toString() !== id);
    
    // Score and sort products
    const scoredProducts = filteredProducts.map(product => {
      let score = 0;
      
      // Same subcategory gets highest score (30 points)
      if (product.subCategory === currentProduct.subCategory && product.category === currentProduct.category) {
        score = 30;
      }
      // Same category gets medium score (10 points)  
      else if (product.category === currentProduct.category) {
        score = 10;
      }
      
      return {
        ...product,
        totalScore: score
      };
    });
    
    // Sort by score (highest first), then by creation date (newest first)
    const sortedProducts = scoredProducts.sort((a, b) => {
      if (b.totalScore !== a.totalScore) {
        return b.totalScore - a.totalScore;
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    
    // Take top products
    const relatedProducts = sortedProducts.slice(0, parseInt(limit));
    
    // Transform the data to match frontend expectations
    const transformedProducts = relatedProducts.map(product => ({
      id: product._id.toString(),
      name: product.title,
      price: product.salePrice,
      originalPrice: product.regularPrice,
      image: product.images && product.images.length > 0 ? 
        (product.images[0].url || product.images[0].uri || '') : '',
      images: product.images || [],
      category: product.category,
      subCategory: product.subCategory,
      stock: product.stock,
      brand: product.brand,
      rating: 4.0 + Math.random() * 1, // Mock rating for now
      reviews: Math.floor(Math.random() * 200) + 10, // Mock reviews count
      seller: product.sellerId ? {
        name: product.sellerId.shop?.shopName || 'Unknown Shop',
        verified: product.sellerId.verified || false,
        email: product.sellerId.email || '',
        phone: product.sellerId.phoneNumber || ''
      } : null,
      matchScore: product.totalScore
    }));
    
    res.json({
      success: true,
      products: transformedProducts,
      count: transformedProducts.length,
      currentProduct: {
        id: currentProduct._id,
        category: currentProduct.category,
        subCategory: currentProduct.subCategory
      }
    });
    
  } catch (error) {
    console.error('Error fetching related products:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch related products',
      error: error.message
    });
  }
});

module.exports = router;