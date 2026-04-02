const express = require('express');
const router = express.Router();

// Categories data - in a real app, this would come from a database
const CATEGORIES_DATA = {
  success: true,
  categories: [
    "Electronics", 
    "Fashion", 
    "Home & Garden", 
    "Health & Beauty",
    "Sports & Outdoors", 
    "Automotive", 
    "Food & Beverages",
    "Office Supplies", 
    "Industrial", 
    "Agriculture"
  ],
  subCategories: {
    "Electronics": ["Phones", "Laptops", "Tablets", "Accessories", "Gaming", "Audio & Video"],
    "Fashion": ["Men's Clothing", "Women's Clothing", "Shoes", "Bags", "Jewelry", "Watches"],
    "Home & Garden": ["Furniture", "Kitchen", "Bedding", "Decor", "Garden Tools", "Lighting"],
    "Health & Beauty": ["Skincare", "Makeup", "Hair Care", "Personal Care", "Supplements", "Medical"],
    "Sports & Outdoors": ["Fitness", "Camping", "Cycling", "Team Sports", "Water Sports", "Winter Sports"],
    "Automotive": ["Car Parts", "Accessories", "Tools", "Oils & Fluids", "Tires", "Electronics"],
    "Food & Beverages": ["Snacks", "Beverages", "Groceries", "Organic", "Frozen", "Dairy"],
    "Office Supplies": ["Stationery", "Furniture", "Electronics", "Storage", "Paper", "Writing"],
    "Industrial": ["Tools", "Safety Equipment", "Raw Materials", "Machinery", "Electrical", "Plumbing"],
    "Agriculture": ["Seeds", "Fertilizers", "Equipment", "Livestock", "Irrigation", "Pesticides"]
  }
};

// GET /api/categories - Get all categories and subcategories
router.get('/', async (req, res) => {
  try {
    // In a real application, you would fetch this from a database
    // For now, we'll return the static data
    res.json(CATEGORIES_DATA);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: error.message
    });
  }
});

// POST /api/categories - Add a new category (for future use)
router.post('/', async (req, res) => {
  try {
    const { category, subcategories = [] } = req.body;
    
    if (!category || typeof category !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Category name is required and must be a string'
      });
    }

    // In a real app, you would save this to a database
    // For now, we'll just return success
    res.json({
      success: true,
      message: 'Category added successfully',
      category,
      subcategories
    });
  } catch (error) {
    console.error('Error adding category:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add category',
      error: error.message
    });
  }
});

// POST /api/categories/:category/subcategories - Add subcategory to existing category
router.post('/:category/subcategories', async (req, res) => {
  try {
    const { category } = req.params;
    const { subcategory } = req.body;
    
    if (!subcategory || typeof subcategory !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Subcategory name is required and must be a string'
      });
    }

    // In a real app, you would save this to a database
    res.json({
      success: true,
      message: 'Subcategory added successfully',
      category,
      subcategory
    });
  } catch (error) {
    console.error('Error adding subcategory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add subcategory',
      error: error.message
    });
  }
});

module.exports = router;