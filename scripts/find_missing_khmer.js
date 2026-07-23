const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '..', 'all_markets_mapped_fixed.xlsx');
if (fs = require('fs'), fs.existsSync(filePath)) {
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(ws);
  
  const missingKhmer = data.filter(r => {
    return !r['KH name'] || !r.province_kh || !r.district_kh || !r.commune;
  });

  console.log('Total rows with missing Khmer fields:', missingKhmer.length);
  console.log('Sample rows:');
  console.log(missingKhmer.slice(0, 10));
}
