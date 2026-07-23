const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '..', 'all_markets_mapped_fixed.xlsx');
if (fs = require('fs'), fs.existsSync(filePath)) {
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(ws);
  console.log('Columns found:', Object.keys(data[0] || {}));
  console.log('Total rows:', data.length);
  console.log('First 5 rows:');
  console.log(data.slice(0, 5));
} else {
  console.log('File not found at:', filePath);
}
