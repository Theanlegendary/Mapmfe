/**
 * FIX EXCEL KHMER UNICODE ENCODING (UTF-8 BOM + NATIVE XLSX)
 * 1. Creates a native Excel file (.xlsx) with styled green headers & UTF-8 Hanuman/Inter font.
 * 2. Creates a CSV file (.csv) starting with \uFEFF (UTF-8 Byte Order Mark) so Excel
 *    automatically opens Khmer text correctly without corrupted characters (á2•áY'...).
 */

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const jsonInputPath = path.join(DATA_DIR, 'pickup_branches_with_keywords.json');

const xlsxOutputPath = path.join(ROOT_DIR, 'all_700_branches_keywords_mapped.xlsx');
const csvOutputPath = path.join(ROOT_DIR, 'all_700_branches_keywords_mapped.csv');
const dataCsvOutputPath = path.join(DATA_DIR, 'pickup_branches_keywords_mapped.csv');

const branches = JSON.parse(fs.readFileSync(jsonInputPath, 'utf-8'));

console.log(`=== FIXING EXCEL KHMER UNICODE ENCODING FOR ${branches.length} BRANCHES ===`);

async function generatePerfectExcelAndCsv() {
  // ── 1. GENERATE NATIVE EXCEL (.XLSX) ──────────────────────────────
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Metfone GenRoute Engine';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('697 Pickup Branches Keywords', {
    views: [{ showGridLines: true }]
  });

  worksheet.columns = [
    { header: 'No', key: 'no', width: 6 },
    { header: 'Branch Code', key: 'store_code', width: 15 },
    { header: 'Branch Store Name', key: 'store_name', width: 25 },
    { header: 'Province (Khmer)', key: 'province_kh', width: 22 },
    { header: 'District (English)', key: 'district_en', width: 22 },
    { header: 'District (Khmer)', key: 'district_kh', width: 22 },
    { header: 'Latitude', key: 'latitude', width: 14 },
    { header: 'Longitude', key: 'longitude', width: 14 },
    { header: 'Matched Locations (<=12km)', key: 'matched_places_count', width: 25 },
    { header: 'Total Keywords', key: 'matched_keywords_count', width: 16 },
    { header: 'All Search Keywords (Pipe Separated)', key: 'keywords_pipe_separated', width: 120 }
  ];

  // Header Styling (Excel Green #107C41)
  const headerRow = worksheet.getRow(1);
  headerRow.height = 30;
  headerRow.font = { name: 'Inter', size: 11, bold: true, color: { argb: 'FFFFFF' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '107C41' }
    };
    cell.border = {
      top: { style: 'thin', color: { argb: '0E6B37' } },
      left: { style: 'thin', color: { argb: '0E6B37' } },
      bottom: { style: 'thin', color: { argb: '0E6B37' } },
      right: { style: 'thin', color: { argb: '0E6B37' } }
    };
  });

  // ── 2. PREPARE UTF-8 BOM CSV CONTENT ─────────────────────────────
  // \uFEFF forces Excel to open CSV in UTF-8 Unicode mode automatically!
  let csvContent = "\uFEFF"; 
  csvContent += "No,Branch Code,Branch Store Name,Province (Khmer),District (English),District (Khmer),Latitude,Longitude,Matched Locations (<=12km),Total Keywords,All Search Keywords (Pipe Separated)\r\n";

  branches.forEach((b, index) => {
    const rawKeywords = b.matched_keywords_12km || [];
    // Clean keywords: strip linebreaks and extra spaces
    const cleanKeywords = rawKeywords.map(k => (k || '').replace(/[\r\n]/g, ' ').trim()).filter(Boolean);
    const pipeKeywords = cleanKeywords.join(' | ');

    // Add Excel Row
    const rowData = {
      no: index + 1,
      store_code: b.store_code || '',
      store_name: b.store_name || '',
      province_kh: b.province_kh || '',
      district_en: b.district_en || '',
      district_kh: b.district_kh || '',
      latitude: b.latitude || '',
      longitude: b.longitude || '',
      matched_places_count: b.total_matched_places_12km || 0,
      matched_keywords_count: cleanKeywords.length,
      keywords_pipe_separated: pipeKeywords
    };

    const row = worksheet.addRow(rowData);
    row.height = 22;

    const isEven = index % 2 === 1;
    const rowBg = isEven ? 'F8FAFC' : 'FFFFFF';

    row.eachCell((cell, colNumber) => {
      cell.font = { name: 'Hanuman', size: 10, color: { argb: '1E293B' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: rowBg }
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'E2E8F0' } },
        left: { style: 'thin', color: { argb: 'E2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
        right: { style: 'thin', color: { argb: 'E2E8F0' } }
      };

      if (colNumber === 1 || colNumber === 2 || colNumber === 9 || colNumber === 10) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }
    });

    // Add CSV Row with proper quotation escaping
    const safeCode = (b.store_code || '').replace(/"/g, '""');
    const safeName = (b.store_name || '').replace(/"/g, '""');
    const safeProv = (b.province_kh || '').replace(/"/g, '""');
    const safeDistEn = (b.district_en || '').replace(/"/g, '""');
    const safeDistKh = (b.district_kh || '').replace(/"/g, '""');
    const safeKw = pipeKeywords.replace(/"/g, '""');

    csvContent += `${index + 1},"${safeCode}","${safeName}","${safeProv}","${safeDistEn}","${safeDistKh}","${b.latitude || ''}","${b.longitude || ''}",${b.total_matched_places_12km || 0},${cleanKeywords.length},"${safeKw}"\r\n`;
  });

  // Write files
  await workbook.xlsx.writeFile(xlsxOutputPath);
  console.log(`✅ Fixed Native Excel File (.xlsx): ${xlsxOutputPath}`);

  try {
    fs.writeFileSync(csvOutputPath, csvContent, 'utf-8');
    console.log(`✅ Fixed UTF-8 BOM CSV File (.csv): ${csvOutputPath}`);
  } catch (e) {
    console.warn(`⚠️ Note: Could not write ${csvOutputPath} (file may be open in Excel). Close Excel and re-run if needed.`);
  }

  try {
    fs.writeFileSync(dataCsvOutputPath, csvContent, 'utf-8');
    console.log(`✅ Fixed Data CSV File (.csv): ${dataCsvOutputPath}`);
  } catch (e) {
    console.warn(`⚠️ Note: Could not write ${dataCsvOutputPath} (file may be open in Excel).`);
  }

  console.log('=== FIX COMPLETE ===');
}

generatePerfectExcelAndCsv().catch(console.error);
