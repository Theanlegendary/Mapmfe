const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '..', 'all_markets_mapped_fixed.xlsx');
if (fs = require('fs'), fs.existsSync(filePath)) {
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(ws);
  
  // Find non-market names
  const nonMarkets = data.filter(r => {
    const en = String(r['EN name'] || '').toLowerCase();
    const kh = String(r['KH name'] || '');
    return !en.includes('market') && !kh.includes('ផ្សារ');
  });

  console.log('Non-market rows count:', nonMarkets.length);
  console.log('Sample non-market rows:');
  console.log(nonMarkets.slice(0, 10));
}
