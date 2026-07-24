const ExcelJS = require('exceljs');
const path = require('path');

const file = path.join(__dirname, '..', 'PickupBranches_ALL_PICKUP_18.07_10H08.xlsx');

async function inspect() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  console.log('Sheet names:', wb.worksheets.map(w => w.name));
  
  const ws = wb.getWorksheet(1);
  console.log('Row count:', ws.rowCount);
  
  const headers = [];
  ws.getRow(1).eachCell((cell, colNumber) => {
    headers.push({ colNumber, val: String(cell.value || '').trim() });
  });
  console.log('Headers:', headers);
  
  console.log('\nFirst 5 rows sample:');
  for (let i = 2; i <= 7; i++) {
    const row = ws.getRow(i);
    const rowVals = {};
    headers.forEach(h => {
      const cellVal = row.getCell(h.colNumber).value;
      rowVals[h.val] = cellVal;
    });
    console.log(`Row ${i}:`, JSON.stringify(rowVals));
  }
}

inspect();
