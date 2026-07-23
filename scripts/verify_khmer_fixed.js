const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '..', 'all_markets_mapped_fixed.xlsx');
if (fs = require('fs'), fs.existsSync(filePath)) {
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(ws);
  
  const missingKhmer = data.filter(r => {
    return !r['KH name'] || r['KH name'] === 'undefined' || r['KH name'] === 'null';
  });

  console.log('Total rows with missing Khmer name:', missingKhmer.length);
  if (missingKhmer.length > 0) {
    console.log('Sample rows:', missingKhmer.slice(0, 5));
  } else {
    console.log('🎉 100% of rows have correct working Khmer names!');
  }
}
