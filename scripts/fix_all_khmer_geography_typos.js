/**
 * COMPREHENSIVE KHMER GEOGRAPHY SPELLING CLEANER
 * Fixes all legacy decomposed vowel & OCR typos in Khmer place names:
 *  - បរវល -> បវេល (Bavel)
 *  - ខនាច -> ខ្នាច (Khnach)
 *  - រូមេាស / រូមោស -> រមាស (Romeas)
 *  - រូលអូស -> រលួស (Roluos)
 *  - ផនូម / ផនុម -> ភ្នំ (Phnom)
 *  - សពេន -> ស្ពាន (Spean)
 *  - ខមេរ -> ខ្មែរ (Khmer)
 *  - បូរេយ -> បុរី (Borei)
 *  - កបាល -> ក្បាល (Kbal)
 *  - ដេរម / ដែម -> ដើម (Daem)
 *  - រេាត្រេយ -> រាត្រី (Reatrei)
 *  - ដអូរក -> ដក (Dork)
 *  - ចាមការ -> ចំការ (Chamkar)
 *  - មូងកូល -> មង្គល (Mongkol)
 *  - ថមូរ -> ថ្ម (Thmor)
 *  - តនៅត -> ត្នោត (Tnaot)
 *  - ឆនុូ -> ឆ្នួរ (Chhnuor)
 *  - ចរអូយ -> ជ្រោយ (Chrouy)
 *  - សាដី -> សតី (Sadei)
 *  - លវេា -> ល្វា (Lvea)
 *  - តូេក -> ទឹក (Toek)
 *  - សូេរ -> សឿ (Soeu)
 *  - ចាមនូាម -> ចំណោម (Chamnaom)
 *  - បានតេាយ -> បន្ទាយ (Banteay)
 *  - នេាង -> នាង (Neang)
 *  - ជយ / ចេាយ -> ជ័យ (Chey)
 */

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const romanizer = require('../lib/khmer_romanizer');
const autoPick  = require('../lib/auto_pick_engine');

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const jsonInputPath  = path.join(DATA_DIR, 'pickup_branches_with_keywords.json');
const xlsxOutputPath = path.join(ROOT_DIR, 'all_700_branches_keywords_mapped.xlsx');
const csvOutputPath  = path.join(ROOT_DIR, 'all_700_branches_keywords_mapped.csv');

const dataCsvOutputPath  = path.join(DATA_DIR, 'pickup_branches_keywords_mapped.csv');
const ncddXlsxOutputPath = path.join(DATA_DIR, 'official_ncdd_700_branches_mapped.xlsx');
const ncddCsvOutputPath  = path.join(DATA_DIR, 'official_ncdd_700_branches_mapped.csv');

const branches = JSON.parse(fs.readFileSync(jsonInputPath, 'utf-8'));

const KHMER_TYPO_MAP = [
  ['បរវល', 'បវេល'],
  ['ខនាច', 'ខ្នាច'],
  ['រូមេាស', 'រមាស'],
  ['រូមោស', 'រមាស'],
  ['រូេាស', 'រមាស'],
  ['រូលអូស', 'រលួស'],
  ['អូ ូរនដអូញ', 'អូរអណ្ដូង'],
  ['សូេរ', 'សឿ'],
  ['តូេក', 'ទឹក'],
  ['លវេា', 'ល្វា'],
  ['ចាមនូាម', 'ចំណោម'],
  ['បានតេាយ', 'បន្ទាយ'],
  ['នេាង', 'នាង'],
  ['តនៅត', 'ត្នោត'],
  ['ផនូម', 'ភ្នំ'],
  ['ផនុម', 'ភ្នំ'],
  ['ខមេរ', 'ខ្មែរ'],
  ['សពេន', 'ស្ពាន'],
  ['បូរេយ', 'បុរី'],
  ['កបាល', 'ក្បាល'],
  ['ដេរម', 'ដើម'],
  ['ដែម', 'ដើម'],
  ['រេាត្រេយ', 'រាត្រី'],
  ['ដអូរក', 'ដក'],
  ['ចាមការ', 'ចំការ'],
  ['មូងកូល', 'មង្គល'],
  ['ថមូរ', 'ថ្ម'],
  ['កូនដូមរេយ', 'កូនដំរី'],
  ['តអូហ', 'តាហ្វ'],
  ['ឆនុូ', 'ឆ្នួរ'],
  ['មេាន', 'មាន'],
  ['ចេាយ', 'ជ័យ'],
  ['បីហ្គ', 'ប៊ិក'],
  ['ក្រូរ', 'ក្រពើ'],
  ['មុូន', 'មាន់'],
  ['ចរអូយ', 'ជ្រោយ'],
  ['សាដី', 'សតី'],
  ['ផាលីតផាល', 'ផលិតផល'],
  ['កនតល', 'កណ្ដាល'],
  ['ហុយ លេង', 'ហុយឡេង']
];

function fixKhmerText(text) {
  if (!text || typeof text !== 'string') return text;
  let s = text;
  KHMER_TYPO_MAP.forEach(([bad, good]) => {
    if (s.includes(bad)) {
      s = s.split(bad).join(good);
    }
  });
  return autoPick.normalizeKhmerEnhanced(s);
}

console.log(`=== RUNNING ADVANCED KHMER SPELLING FIXES FOR ${branches.length} BRANCHES ===`);

let totalFixes = 0;

branches.forEach(b => {
  if (b.province_kh) b.province_kh = fixKhmerText(b.province_kh);
  if (b.district_kh) b.district_kh = fixKhmerText(b.district_kh);
  if (b.commune_kh)  b.commune_kh  = fixKhmerText(b.commune_kh);

  if (b.matched_keywords_12km && Array.isArray(b.matched_keywords_12km)) {
    const cleanedSet = new Set();
    b.matched_keywords_12km.forEach(k => {
      let cleaned = fixKhmerText(k);
      if (cleaned !== k) totalFixes++;
      if (cleaned) cleanedSet.add(cleaned);

      // Regenerate Latin transliteration if Khmer
      if (/[\u1780-\u17FF]/.test(cleaned)) {
        const latin = romanizer.khmerToLatin(cleaned);
        if (latin && latin.trim() && latin !== cleaned) {
          cleanedSet.add(latin.trim());
        }
      }
    });
    const finalKw = Array.from(cleanedSet);
    b.matched_keywords_12km = finalKw;
    b.total_matched_keywords_12km = finalKw.length;
  }
});

console.log(`✅ Applied ${totalFixes} Khmer typo corrections across ${branches.length} branches`);

// Save updated JSON
fs.writeFileSync(jsonInputPath, JSON.stringify(branches, null, 2), 'utf-8');
console.log(`✅ Saved data/pickup_branches_with_keywords.json`);

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
    { header: 'Total Keywords', key: 'matched_keywords_count', width: 16 },
    { header: 'All Search Keywords (Pipe Separated)', key: 'keywords_pipe_separated', width: 120 }
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
  csvContent += "No,Branch Code,Branch Store Name,Official Province (Khmer),Official District (English),Official District (Khmer),Official Commune (Khmer),NCDD Commune Code,Latitude,Longitude,Matched Locations (<=12km),Total Keywords,All Search Keywords (Pipe Separated)\r\n";

  branches.forEach((b, index) => {
    const kwList = b.matched_keywords_12km || [];
    const pipeKeywords = kwList.join(' | ');

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
      matched_keywords_count: kwList.length,
      keywords_pipe_separated: pipeKeywords
    });

    const safeCode = (b.store_code || '').replace(/"/g, '""');
    const safeName = (b.store_name || '').replace(/"/g, '""');
    const safeProv = (b.province_kh || '').replace(/"/g, '""');
    const safeDistEn = (b.district_en || '').replace(/"/g, '""');
    const safeDistKh = (b.district_kh || '').replace(/"/g, '""');
    const safeCommKh = (b.commune_kh || '').replace(/"/g, '""');
    const safeCommCode = (b.commune_code || '').replace(/"/g, '""');
    const safeKw = pipeKeywords.replace(/"/g, '""');

    csvContent += `${index + 1},"${safeCode}","${safeName}","${safeProv}","${safeDistEn}","${safeDistKh}","${safeCommKh}","${safeCommCode}","${b.latitude || ''}","${b.longitude || ''}",${b.total_matched_places_12km || 0},${kwList.length},"${safeKw}"\r\n`;
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

  console.log('=== KHMER TYPO CORRECTION COMPLETE ===');
}

exportFiles().catch(console.error);
