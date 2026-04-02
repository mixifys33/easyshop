const express = require('express');
const Product = require('../models/Product');
const router = express.Router();

// POST /api/products/draft - Save product as draft
router.post('/', async (req, res) => {
  try {
    const draftData = req.body;
    
    // For now, we'll get sellerId from the request body
    // In a real app, this would come from authentication middleware
    if (!draftData.sellerId) {
      return res.status(400).json({
        success: false,
        message: 'Seller ID is required'
      });
    }

    // Basic validation for draft - only require title
    if (!draftData.title || !draftData.title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Product title is required for draft'
      });
    }

    // Create draft object
    const draft = new Product({
      ...draftData,
      status: 'draft',
      isDraft: true,
      draftExpiresAt: draftData.draftExpiresAt || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days from now
    });
    
    const savedDraft = await draft.save();
    
    console.log('Draft saved:', savedDraft._id);
    
    res.status(201).json({
      success: true,
      message: 'Draft saved successfully',
      draft: {
        id: savedDraft._id,
        title: savedDraft.title,
        slug: savedDraft.slug,
        draftExpiresAt: savedDraft.draftExpiresAt
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

// GET /api/products/draft/all - Get all drafts for a seller
router.get('/all', async (req, res) => {
  try {
    const { sellerId } = req.query;
    
    if (!sellerId) {
      return res.status(400).json({
        success: false,
        message: 'Seller ID is required'
      });
    }

    // Filter out expired drafts and get valid ones
    const now = new Date();
    const validDrafts = await Product.find({
      sellerId,
      isDraft: true,
      status: 'draft',
      draftExpiresAt: { $gt: now }
    }).sort({ updatedAt: -1 });
    
    // Remove expired drafts from database
    await Product.deleteMany({
      sellerId,
      isDraft: true,
      status: 'draft',
      draftExpiresAt: { $lte: now }
    });
    
    res.json({
      success: true,
      drafts: validDrafts.map(draft => ({
        id: draft._id,
        title: draft.title,
        slug: draft.slug,
        description: draft.description,
        category: draft.category,
        subCategory: draft.subCategory,
        regularPrice: draft.regularPrice,
        salePrice: draft.salePrice,
        stock: draft.stock,
        images: draft.images,
        draftExpiresAt: draft.draftExpiresAt,
        createdAt: draft.createdAt,
        updatedAt: draft.updatedAt
      })),
      count: validDrafts.length
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

// GET /api/products/draft/:id - Get specific draft
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const draft = await Product.findOne({
      _id: id,
      isDraft: true,
      status: 'draft'
    });
    
    if (!draft) {
      return res.status(404).json({
        success: false,
        message: 'Draft not found'
      });
    }
    
    // Check if draft is expired
    if (new Date(draft.draftExpiresAt) <= new Date()) {
      // Remove expired draft
      await Product.findByIdAndDelete(id);
      return res.status(404).json({
        success: false,
        message: 'Draft has expired'
      });
    }
    
    res.json({
      success: true,
      draft
    });
    
  } catch (error) {
    console.error('Error fetching draft:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch draft',
      error: error.message
    });
  }
});

// PUT /api/products/draft/:id - Update draft
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const draft = await Product.findOne({
      _id: id,
      isDraft: true,
      status: 'draft'
    });
    
    if (!draft) {
      return res.status(404).json({
        success: false,
        message: 'Draft not found'
      });
    }
    
    // Check if draft is expired
    if (new Date(draft.draftExpiresAt) <= new Date()) {
      await Product.findByIdAndDelete(id);
      return res.status(404).json({
        success: false,
        message: 'Draft has expired'
      });
    }
    
    // Update draft
    const updatedDraft = await Product.findByIdAndUpdate(
      id,
      { ...updateData, updatedAt: new Date() },
      { new: true, runValidators: true }
    );
    
    res.json({
      success: true,
      message: 'Draft updated successfully',
      draft: updatedDraft
    });
    
  } catch (error) {
    console.error('Error updating draft:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update draft',
      error: error.message
    });
  }
});

// DELETE /api/products/draft/:id - Delete draft
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const draft = await Product.findOneAndDelete({
      _id: id,
      isDraft: true,
      status: 'draft'
    });
    
    if (!draft) {
      return res.status(404).json({
        success: false,
        message: 'Draft not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Draft deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting draft:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete draft',
      error: error.message
    });
  }
});

// POST /api/products/draft/:id/publish - Publish draft as product
router.post('/:id/publish', async (req, res) => {
  try {
    const { id } = req.params;
    const draft = await Product.findOne({
      _id: id,
      isDraft: true,
      status: 'draft'
    });
    
    if (!draft) {
      return res.status(404).json({
        success: false,
        message: 'Draft not found'
      });
    }
    
    // Check if draft is expired
    if (new Date(draft.draftExpiresAt) <= new Date()) {
      await Product.findByIdAndDelete(id);
      return res.status(404).json({
        success: false,
        message: 'Draft has expired'
      });
    }
    
    // Validate required fields for publishing
    const requiredFields = ['title', 'description', 'category', 'subCategory', 'regularPrice', 'salePrice'];
    const missingFields = requiredFields.filter(field => !draft[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }
    
    if (!draft.images || draft.images.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one image is required'
      });
    }
    
    // Convert draft to product
    const publishedProduct = await Product.findByIdAndUpdate(
      id,
      {
        status: 'active',
        isDraft: false,
        draftExpiresAt: undefined,
        publishedAt: new Date()
      },
      { new: true, runValidators: true }
    );
    
    console.log('Draft published as product:', publishedProduct._id);
    
    res.json({
      success: true,
      message: 'Draft published successfully',
      product: {
        id: publishedProduct._id,
        title: publishedProduct.title,
        slug: publishedProduct.slug
      }
    });
    
  } catch (error) {
    console.error('Error publishing draft:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to publish draft',
      error: error.message
    });
  }
});

module.exports = router;