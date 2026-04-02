const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

// Test the bulk upload parsing functionality
async function testBulkUploadParsing() {
  console.log('Testing bulk upload parsing...');
  
  // Create a test CSV file with both Regular Price and Sale Price
  const testCSV = `Product Name,SKU,Short Description,Detailed Description,Regular Price,Sale Price,Stock,Category,Sub Category,Brand,Colors,Sizes,Tags,Warranty,Image URLs,Video URL,Cash on Delivery,Currency
iPhone 14,IP14-001,Latest iPhone with advanced features,The iPhone 14 features a stunning display,999000,899000,50,Electronics,Phones,Apple,"Black, White, Blue",One Size,"smartphone, iphone, apple",1 Year,"https://example.com/img1.jpg, https://example.com/img2.jpg",https://youtube.com/watch?v=example,Yes,UGX
Samsung Galaxy S23,SG23-002,Premium Android smartphone,High-performance Android device with advanced camera,850000,750000,30,Electronics,Phones,Samsung,"Black, White",One Size,"android, samsung, smartphone",2 Years,"https://example.com/samsung1.jpg",https://youtube.com/watch?v=samsung,Yes,UGX`;

  // Write test file
  const testFilePath = path.join(__dirname, 'test-upload.csv');
  fs.writeFileSync(testFilePath, testCSV);
  
  try {
    // Parse the test file
    const csvData = fs.readFileSync(testFilePath, 'utf8');
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
    
    let headers = [];
    let data = [];
    
    if (lines.length > 0) {
      // Extract headers from first line
      headers = parseCSVLine(lines[0]);
      
      // Parse data rows
      for (let i = 1; i < lines.length; i++) {
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
    
    console.log('✅ Parsing successful!');
    console.log('Headers found:', headers);
    console.log('Number of data rows:', data.length);
    console.log('Sample data:', data[0]);
    
    // Check if both price columns are present
    const hasRegularPrice = headers.includes('Regular Price');
    const hasSalePrice = headers.includes('Sale Price');
    
    console.log('\n📊 Price Column Check:');
    console.log('Regular Price column found:', hasRegularPrice ? '✅' : '❌');
    console.log('Sale Price column found:', hasSalePrice ? '✅' : '❌');
    
    if (hasRegularPrice && hasSalePrice) {
      console.log('🎉 SUCCESS: Both price columns are properly parsed!');
    } else {
      console.log('❌ ISSUE: Missing price columns');
    }
    
  } catch (error) {
    console.error('❌ Error during parsing:', error);
  } finally {
    // Clean up test file
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  }
}

// Run the test
testBulkUploadParsing();