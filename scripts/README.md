# Backend Scripts

This directory contains utility scripts for managing the EasyShop backend.

## Available Scripts

### Check Products Statistics

```bash
# From the backend directory
npm run check-products

# Or run directly
node scripts/checkProducts.js
```

This script provides comprehensive statistics about your products including:

- Total product count
- Products by status (active, draft, inactive)
- Products by category
- Top sellers by product count
- Recent products
- Draft statistics
- Price statistics

### Example Output

```
📊 PRODUCT STATISTICS

==================================================
📦 Total Products: 25

📈 Products by Status:
  active: 20 products (Total Value: 1250000.00)
  draft: 5 products (Total Value: 125000.00)

🏷️ Active Products by Category:
  Electronics: 8 products
  Fashion: 6 products
  Home & Garden: 4 products
  Health & Beauty: 2 products

👥 Top 10 Sellers by Product Count:
  TechStore Uganda: 12 products (Total Value: 850000.00)
  Fashion Hub: 8 products (Total Value: 400000.00)

🆕 5 Most Recent Products:
  1. "iPhone 15 Pro Max" by TechStore Uganda - UGX 4500000
  2. "Samsung Galaxy S24" by TechStore Uganda - UGX 3200000
  3. "Designer Handbag" by Fashion Hub - UGX 250000

📝 Draft Statistics:
  Total Drafts: 5
  Expired Drafts: 1
  Active Drafts: 4

💰 Price Statistics (Active Products):
  Average Price: 62500.00
  Minimum Price: 15000.00
  Maximum Price: 4500000.00
  Total Inventory Value: 1250000.00
==================================================
```

## Requirements

- MongoDB connection
- Node.js environment with required dependencies
- Proper environment variables set up
