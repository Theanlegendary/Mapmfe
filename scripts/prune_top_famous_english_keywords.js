/**
 * PRUNE TOP FAMOUS ENGLISH KEYWORDS & MAJOR STREETS
 * Keeps ONLY top famous landmarks, major markets, and major streets/boulevards/highways.
 * Formats clean plain text file BRANCH_KEYWORDS_ENGLISH_ONLY.txt for Notepad & AI prompts.
 */

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const jsonInputPath  = path.join(DATA_DIR, 'pickup_branches_with_keywords.json');
const txtOutputPath  = path.join(ROOT_DIR, 'BRANCH_KEYWORDS_ENGLISH_ONLY.txt');
const aiJsonPath     = path.join(ROOT_DIR, 'BRANCH_DATA_FOR_AI.json');

const xlsxOutputPath = path.join(ROOT_DIR, 'all_700_branches_keywords_mapped.xlsx');
const csvOutputPath  = path.join(ROOT_DIR, 'all_700_branches_keywords_mapped.csv');

const dataCsvOutputPath  = path.join(DATA_DIR, 'pickup_branches_keywords_mapped.csv');
const ncddXlsxOutputPath = path.join(DATA_DIR, 'official_ncdd_700_branches_mapped.xlsx');
const ncddCsvOutputPath  = path.join(DATA_DIR, 'official_ncdd_700_branches_mapped.csv');

const branches = JSON.parse(fs.readFileSync(jsonInputPath, 'utf-8'));

console.log(`=== PRUNING TOP FAMOUS ENGLISH KEYWORDS & STREETS FOR ${branches.length} BRANCHES ===`);

const MAJOR_STREET_REGEX = /street\s*\d+|st\.\s*\d+|blvd|boulevard|national road|nr\s*\d+|veng sreng|monivong|norodom|sihanouk|charles de gaulle|kampuchea krom|mao tse toung|russian|271|63|182|1986|2004|598|371/i;

const MAJOR_FAMOUS_REGEX = /central market|phsar thmei|russian market|olympic market|phsar kandal|orussey market|night market|big c|aeon|airport|bridge|poipet market|border market|hospital|university|borey|mall|supermarket/i;

let totalBefore = 0;
let totalAfter  = 0;

let txtContent = "================================================================================\r\n";
txtContent += "PICKUP BRANCHES - TOP FAMOUS ENGLISH KEYWORDS & MAJOR STREETS (FOR NOTEPAD / AI)\r\n";
txtContent += "Total Branches: " + branches.length + "\r\n";
txtContent += "================================================================================\r\n\r\n";

const aiData = [];

branches.forEach((b, idx) => {
  const enList = b.english_keywords_12km || [];
  totalBefore += enList.length;

  const topSet = new Set();
  const seenLower = new Set();

  function addClean(term) {
    if (!term || typeof term !== 'string') return;
    const clean = term.trim();
    if (!clean) return;
    const lower = clean.toLowerCase();

    // Skip Khmer characters inside English list
    if (/[\u1780-\u17FF]/.test(clean)) return;
    if (lower.length <= 2 && !/^\d+$/.test(lower)) return;

    if (!seenLower.has(lower)) {
      seenLower.add(lower);
      topSet.add(clean);
    }
  }

  // 1. Core Mandatory Identifiers
  if (b.store_code)  addClean(b.store_code);
  if (b.store_name)  addClean(b.store_name);
  if (b.district_en) addClean(b.district_en);
  if (b.commune_code)addClean(b.commune_code);

  // 2. Filter for Major Streets & Major Famous Landmarks
  enList.forEach(kw => {
    if (!kw || typeof kw !== 'string') return;
    const clean = kw.trim();

    if (MAJOR_STREET_REGEX.test(clean) || MAJOR_FAMOUS_REGEX.test(clean)) {
      addClean(clean);
    }
  });

  const finalTopEn = Array.from(topSet);
  b.english_keywords_12km  = finalTopEn;
  b.total_english_keywords = finalTopEn.length;

  // Update total keywords list
  const khmerList = b.khmer_keywords_12km || [];
  b.matched_keywords_12km = [...finalTopEn, ...khmerList];
  b.total_matched_keywords_12km = b.matched_keywords_12km.length;

  totalAfter += finalTopEn.length;

  const pipeTopEn = finalTopEn.join(' | ');

  txtContent += `[BRANCH #${idx + 1}]\r\n`;
  txtContent += `Branch Code   : ${b.store_code || ''}\r\n`;
  txtContent += `Store Name    : ${b.store_name || ''}\r\n`;
  txtContent += `Province (KH) : ${b.province_kh || ''}\r\n`;
  txtContent += `District (EN) : ${b.district_en || ''}\r\n`;
  txtContent += `District (KH) : ${b.district_kh || ''}\r\n`;
  txtContent += `Commune (KH)  : ${b.commune_kh || ''}\r\n`;
  txtContent += `NCDD Code     : ${b.commune_code || ''}\r\n`;
  txtContent += `Latitude      : ${b.latitude || ''}\r\n`;
  txtContent += `Longitude     : ${b.longitude || ''}\r\n`;
  txtContent += `Top English Keywords & Streets (${finalTopEn.length}) :\r\n${pipeTopEn}\r\n`;
  txtContent += `--------------------------------------------------------------------------------\r\n\r\n`;

  aiData.push({
    no: idx + 1,
    store_code: b.store_code || '',
    store_name: b.store_name || '',
    province_kh: b.province_kh || '',
    district_en: b.district_en || '',
    district_kh: b.district_kh || '',
    commune_kh: b.commune_kh || '',
    commune_code: b.commune_code || '',
    latitude: b.latitude || '',
    longitude: b.longitude || '',
    top_english_keywords_count: finalTopEn.length,
    top_english_keywords_pipe: pipeTopEn
  });
});

console.log(`✅ Pruned English Keywords: ${totalBefore} → ${totalAfter} (Avg per branch: ${(totalAfter/branches.length).toFixed(1)} top famous/street terms)`);

// 1. Save Notepad Text File (.txt)
fs.writeFileSync(txtOutputPath, txtContent, 'utf-8');
console.log(`✅ Saved Notepad Text File (.txt): ${txtOutputPath}`);

// 2. Save AI JSON File (.json)
fs.writeFileSync(aiJsonPath, JSON.stringify(aiData, null, 2), 'utf-8');
console.log(`✅ Saved AI JSON File (.json): ${aiJsonPath}`);

// 3. Save Master Database JSON
fs.writeFileSync(jsonInputPath, JSON.stringify(branches, null, 2), 'utf-8');
console.log(`✅ Saved data/pickup_branches_with_keywords.json`);

// 4. Export Excel and CSV files
async function exportFiles() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Metfone GenRoute Engine';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Top Famous Branch Keywords', {
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
    { header: 'Top English Keywords Count', key: 'english_keywords_count', width: 25 },
    { header: 'Top English Search Keywords & Streets (Pipe Separated)', key: 'english_keywords_pipe', width: 90 },
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
  csvContent += "No,Branch Code,Branch Store Name,Official Province (Khmer),Official District (English),Official District (Khmer),Official Commune (Khmer),NCDD Commune Code,Latitude,Longitude,Matched Locations (<=12km),Top English Keywords Count,Top English Search Keywords & Streets (Pipe Separated),Khmer Keywords Count,Khmer Search Keywords (Pipe Separated),All Combined Search Keywords (Pipe Separated)\r\n";

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

  console.log('=== TOP FAMOUS PRUNING COMPLETE ===');
}

exportFiles().catch(console.error);
