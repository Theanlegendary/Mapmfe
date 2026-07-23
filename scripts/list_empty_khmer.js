const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '..', 'all_markets_mapped_fixed.xlsx');
if (fs = require('fs'), fs.existsSync(filePath)) {
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(ws);
  
  const emptyKh = data.filter(r => {
    const kh = String(r['KH name'] || '').trim();
    const en = String(r['EN name'] || '').trim();
    const isMkt = en.toLowerCase().includes('market') || kh.includes('ផ្សារ') || en.toLowerCase().includes('phsar') || en.toLowerCase().includes('psar');
    return isMkt && !kh;
  }).map(r => r['EN name']);

  console.log('Unique empty Khmer markets count:', emptyKh.length);
  console.log(JSON.stringify(emptyKh, null, 2));
}
