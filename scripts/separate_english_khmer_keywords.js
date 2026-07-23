/**
 * SEPARATE ENGLISH AND KHMER KEYWORDS INTO DEDICATED COLUMNS
 * 1. English Search Keywords (Pipe Separated): Only Latin / English terms
 * 2. Khmer Search Keywords (Pipe Separated): Only Khmer Unicode terms
 * 3. All Combined Search Keywords (Pipe Separated): Both English + Khmer
 */

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const jsonInputPath  = path.join(DATA_DIR, 'pickup_branches_with_keywords.json');
const xlsxOutputPath = path.join(ROOT_DIR, 'all_700_branches_keywords_mapped.xlsx');
const csvOutputPath  = path.join(ROOT_DIR, 'all_700_branches_keywords_mapped.csv');

const dataCsvOutputPath  = path.join(DATA_DIR, 'pickup_branches_keywords_mapped.csv');
const ncddXlsxOutputPath = path.join(DATA_DIR, 'official_ncdd_700_branches_mapped.xlsx');
const ncddCsvOutputPath  = path.join(DATA_DIR, 'official_ncdd_700_branches_mapped.csv');

const branches = JSON.parse(fs.readFileSync(jsonInputPath, 'utf-8'));

console.log(`=== SEPARATING ENGLISH & KHMER KEYWORDS FOR ${branches.length} BRANCHES ===`);

branches.forEach(b => {
  const kwList = b.matched_keywords_12km || [];
  
  const englishSet = new Set();
  const khmerSet   = new Set();

  kwList.forEach(kw => {
    if (!kw || !kw.trim()) return;
    const cleanKw = kw.trim();
    if (/[\u1780-\u17FF]/.test(cleanKw)) {
      khmerSet.add(cleanKw);
    } else {
      englishSet.add(cleanKw);
    }
  });

  b.english_keywords_12km = Array.from(englishSet);
  b.khmer_keywords_12km   = Array.from(khmerSet);
  b.total_english_keywords = b.english_keywords_12km.length;
  b.total_khmer_keywords   = b.khmer_keywords_12km.length;
});

// Save updated JSON
fs.writeFileSync(jsonInputPath, JSON.stringify(branches, null, 2), 'utf-8');
console.log(`✅ Saved updated data/pickup_branches_with_keywords.json`);

// Export Excel and CSV files
async function exportFiles() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Metfone GenRoute Engine';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Official NCDD Pickup Branches', {
    views: [{ showGridLines: true }]
  });

  worksheet.columns = [
    { header: 'No', key: 'no', width: 6 },
    { header: 'Branch Code', key: 'store_code', width: 15 },
    { header: 'Branch Store Name', key: 'store_name', width: 25 },
    { header: 'Official Province (Khmer)', key: 'province_kh', width: 25 },
    { header: 'Official District (English)', key: 'district_en', width: 24 },
    { header: 'Official District (Khmer)', key: 'district_kh', width: 24 },
    { header: 'Official Commune (Khmer)', key: 'commune_kh', width: 24 },
    { header: 'NCDD Commune Code', key: 'commune_code', width: 20 },
    { header: 'Latitude', key: 'latitude', width: 14 },
    { header: 'Longitude', key: 'longitude', width: 14 },
    { header: 'Matched Locations (<=12km)', key: 'matched_places_count', width: 25 },
    { header: 'English Keywords Count', key: 'english_keywords_count', width: 22 },
    { header: 'English Search Keywords (Pipe Separated)', key: 'english_keywords_pipe', width: 80 },
    { header: 'Khmer Keywords Count', key: 'khmer_keywords_count', width: 20 },
    { header: 'Khmer Search Keywords (Pipe Separated)', key: 'khmer_keywords_pipe', width: 80 },
    { header: 'All Combined Search Keywords (Pipe Separated)', key: 'all_keywords_pipe', width: 120 }
  ];

  const headerRow = worksheet.getRow(1);
  headerRow.height = 30;
  headerRow.font = { name: 'Inter', size: 11, bold: true, color: { argb: 'FFFFFF' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '107C41' } };
    cell.border = {
      top: { style: 'thin', color: { argb: '0E6B37' } },
      left: { style: 'thin', color: { argb: '0E6B37' } },
      bottom: { style: 'thin', color: { argb: '0E6B37' } },
      right: { style: 'thin', color: { argb: '0E6B37' } }
    };
  });

  let csvContent = "\uFEFF"; // UTF-8 BOM
  csvContent += "No,Branch Code,Branch Store Name,Official Province (Khmer),Official District (English),Official District (Khmer),Official Commune (Khmer),NCDD Commune Code,Latitude,Longitude,Matched Locations (<=12km),English Keywords Count,English Search Keywords (Pipe Separated),Khmer Keywords Count,Khmer Search Keywords (Pipe Separated),All Combined Search Keywords (Pipe Separated)\r\n";

  branches.forEach((b, index) => {
    const enList = b.english_keywords_12km || [];
    const khList = b.khmer_keywords_12km || [];
    const allList = b.matched_keywords_12km || [];

    const enPipe  = enList.join(' | ');
    const khPipe  = khList.join(' | ');
    const allPipe = allList.join(' | ');

    worksheet.addRow({
      no: index + 1,
      store_code: b.store_code || '',
      store_name: b.store_name || '',
      province_kh: b.province_kh || '',
      district_en: b.district_en || '',
      district_kh: b.district_kh || '',
      commune_kh: b.commune_kh || '',
      commune_code: b.commune_code || '',
      latitude: b.latitude || '',
      longitude: b.longitude || '',
      matched_places_count: b.total_matched_places_12km || 0,
      english_keywords_count: enList.length,
      english_keywords_pipe: enPipe,
      khmer_keywords_count: khList.length,
      khmer_keywords_pipe: khPipe,
      all_keywords_pipe: allPipe
    });

    const safeCode = (b.store_code || '').replace(/"/g, '""');
    const safeName = (b.store_name || '').replace(/"/g, '""');
    const safeProv = (b.province_kh || '').replace(/"/g, '""');
    const safeDistEn = (b.district_en || '').replace(/"/g, '""');
    const safeDistKh = (b.district_kh || '').replace(/"/g, '""');
    const safeCommKh = (b.commune_kh || '').replace(/"/g, '""');
    const safeCommCode = (b.commune_code || '').replace(/"/g, '""');

    const safeEnPipe  = enPipe.replace(/"/g, '""');
    const safeKhPipe  = khPipe.replace(/"/g, '""');
    const safeAllPipe = allPipe.replace(/"/g, '""');

    csvContent += `${index + 1},"${safeCode}","${safeName}","${safeProv}","${safeDistEn}","${safeDistKh}","${safeCommKh}","${safeCommCode}","${b.latitude || ''}","${b.longitude || ''}",${b.total_matched_places_12km || 0},${enList.length},"${safeEnPipe}",${khList.length},"${safeKhPipe}","${safeAllPipe}"\r\n`;
  });

  try {
    await workbook.xlsx.writeFile(xlsxOutputPath);
    console.log(`✅ Saved Excel file (.xlsx): ${xlsxOutputPath}`);
  } catch (e) {
    console.warn(`⚠️ Warning writing ${xlsxOutputPath}: file may be open in Excel.`);
  }

  try {
    await workbook.xlsx.writeFile(ncddXlsxOutputPath);
    console.log(`✅ Saved NCDD Excel file (.xlsx): ${ncddXlsxOutputPath}`);
  } catch (e) {
    console.warn(`⚠️ Warning writing ${ncddXlsxOutputPath}: file may be open in Excel.`);
  }

  try {
    fs.writeFileSync(csvOutputPath, csvContent, 'utf-8');
    console.log(`✅ Saved CSV file (.csv): ${csvOutputPath}`);
  } catch (e) {
    console.warn(`⚠️ Warning writing ${csvOutputPath}: file may be open in Excel.`);
  }

  try {
    fs.writeFileSync(dataCsvOutputPath, csvContent, 'utf-8');
    fs.writeFileSync(ncddCsvOutputPath, csvContent, 'utf-8');
    console.log(`✅ Saved Data CSV files (.csv)`);
  } catch (e) {
    console.warn(`⚠️ Warning writing CSV data files: file may be open in Excel.`);
  }

  console.log('=== SEPARATION COMPLETE ===');
}

exportFiles().catch(console.error);
