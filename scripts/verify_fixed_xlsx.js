const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '..', 'all_markets_mapped_fixed.xlsx');
if (fs = require('fs'), fs.existsSync(filePath)) {
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(ws);
  console.log('Columns in fixed sheet:', Object.keys(data[0] || {}));
  console.log('First 3 rows values:');
  console.log(JSON.stringify(data.slice(0, 3), null, 2));
}
