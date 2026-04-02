const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

async function testExcelParsing() {
  try {
    console.log('Testing Excel file creation and parsing...');
    
    // Create a test Excel file
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Products');
    
    // Add headers
    const headers = ['Product Name', 'SKU', 'Regular Price', 'Sale Price', 'Stock', 'Category'];
    worksheet.addRow(headers);
    
    // Add sample data
    worksheet.addRow(['iPhone 14', 'IP14-001', '999000', '899000', '50', 'Electronics']);
    worksheet.addRow(['Samsung Galaxy S23', 'SG23-002', '850000', '750000', '30', 'Electronics']);
    
    // Save the file
    const testFilePath = path.join(__dirname, 'test-excel.xlsx');
    await workbook.xlsx.writeFile(testFilePath);
    console.log('✅ Excel file created successfully');
    
    // Now test parsing it
    console.log('Testing Excel parsing...');
    const parseWorkbook = new ExcelJS.Workbook();
    await parseWorkbook.xlsx.readFile(testFilePath);
    
    const parseWorksheet = parseWorkbook.getWorksheet(1);
    
    if (parseWorksheet) {
      // Extract headers from first row
      const headerRow = parseWorksheet.getRow(1);
      const parsedHeaders = [];
      headerRow.eachCell((cell, colNumber) => {
        parsedHeaders.push(cell.text || cell.value?.toString() || '');
      });
      
      console.log('✅ Headers parsed:', parsedHeaders);
      
      // Parse data rows
      const data = [];
      const maxRows = Math.min(parseWorksheet.rowCount, 10);
      for (let rowNumber = 2; rowNumber <= maxRows; rowNumber++) {
        const row = {};
        const dataRow = parseWorksheet.getRow(rowNumber);
        
        parsedHeaders.forEach((header, index) => {
          const cell = dataRow.getCell(index + 1);
          row[header] = cell.text || cell.value?.toString() || '';
        });
        
        // Only add row if it has some data
        if (Object.values(row).some(value => value.trim() !== '')) {
          data.push(row);
        }
      }
      
      console.log('✅ Data parsed:', data.length, 'rows');
      console.log('Sample data:', data[0]);
      
      // Check for both price columns
      const hasRegularPrice = parsedHeaders.includes('Regular Price');
      const hasSalePrice = parsedHeaders.includes('Sale Price');
      
      console.log('\n📊 Price Column Check:');
      console.log('Regular Price found:', hasRegularPrice ? '✅' : '❌');
      console.log('Sale Price found:', hasSalePrice ? '✅' : '❌');
      
      if (hasRegularPrice && hasSalePrice) {
        console.log('🎉 SUCCESS: Excel parsing works correctly!');
      }
    }
    
    // Clean up
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
    
  } catch (error) {
    console.error('❌ Excel test failed:', error);
  }
}

// Run test
testExcelParsing();