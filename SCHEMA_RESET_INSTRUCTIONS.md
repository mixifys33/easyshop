# Fix Product Schema Validation Error

## Problem

You're getting a validation error mentioning `name`, `price`, and `image` fields, but your frontend is sending `title`, `regularPrice`/`salePrice`, and `images`. This indicates the MongoDB collection is using an old schema.

## Solution

### Step 1: Reset the Product Schema

Run this command from the `backend` directory:

```bash
npm run reset-product-schema
```

This will:

- Drop the existing products collection (if any)
- Create a new collection with the updated schema
- Initialize it properly for the new field structure

### Step 2: Restart Your Backend Server

After running the schema reset:

```bash
npm run dev
```

### Step 3: Test Product Creation

Now try creating a product again. The enhanced logging will show:

**Frontend logs:**

```
Creating product with data:
- Title: Your Product Name
- Description: Your Description
- Category: Electronics
- SubCategory: Phones
- Regular Price: 100000
- Sale Price: 90000
- Stock: 10
- Seller ID: 507f1f77bcf86cd799439011
- Images count: 2
```

**Backend logs:**

```
📦 Received product creation request
📋 Request body keys: [title, description, category, ...]
✅ All validations passed, creating product...
📦 Product object created, saving to database...
✅ Product created successfully: 507f1f77bcf86cd799439012
```

## What the Script Does

1. **Checks existing collection**: Looks for any existing products
2. **Backs up warning**: Warns about data loss (in production, you'd migrate data)
3. **Drops old collection**: Removes the collection with old schema
4. **Creates new schema**: Initializes with the updated Product model
5. **Validates setup**: Creates and removes a test product to ensure schema works

## New Schema Fields

The updated schema expects:

- `title` (not `name`)
- `regularPrice` and `salePrice` (not single `price`)
- `images` array (not single `image`)
- `sellerId` reference
- `category` and `subCategory`
- `stock`, `description`, etc.

## If You Have Existing Products

If you have important product data, consider:

1. Export existing products first
2. Run the schema reset
3. Import products with field mapping:
   - `name` → `title`
   - `price` → `regularPrice` and `salePrice`
   - `image` → `images[0]`

## Verification

After the reset, you should see successful product creation with proper validation and no more schema mismatch errors.
