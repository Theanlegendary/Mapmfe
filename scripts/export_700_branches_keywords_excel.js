/**
 * EXPORT 700 BRANCHES WITH PIPE-SEPARATED KEYWORDS (.XLSX & .CSV)
 * Formats every branch with pipe-separated search keywords:
 * e.g. "93 market | ៩៣ ផ្សារ | banteay meanchey | បន្ទាយមានជ័យ | malai | ម៉ាឡៃ"
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

console.log(`=== EXPORTING ${branches.length} BRANCHES WITH PIPE-SEPARATED KEYWORDS ===`);

async function generateExports() {
  // 1. Create Excel Workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Metfone GenRoute Engine';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('697 Pickup Branches & Keywords', {
    views: [{ showGridLines: true }]
  });

  // Define Columns
  worksheet.columns = [
    { header: 'No', key: 'no', width: 6 },
    { header: 'Branch Code', key: 'store_code', width: 15 },
    { header: 'Branch Store Name', key: 'store_name', width: 25 },
    { header: 'Province (Khmer)', key: 'province_kh', width: 20 },
    { header: 'District (English)', key: 'district_en', width: 22 },
    { header: 'District (Khmer)', key: 'district_kh', width: 22 },
    { header: 'Latitude', key: 'latitude', width: 14 },
    { header: 'Longitude', key: 'longitude', width: 14 },
    { header: 'Matched Locations (≤12km)', key: 'matched_places_count', width: 24 },
    { header: 'Total Keywords', key: 'matched_keywords_count', width: 16 },
    { header: 'All Search Keywords (Pipe Separated)', key: 'keywords_pipe_separated', width: 100 }
  ];

  // Header Styling (Excel Green #107C41)
  const headerRow = worksheet.getRow(1);
  headerRow.height = 28;
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

  // Prepare CSV content
  let csvContent = "sep=,\r\n";
  csvContent += "No,Branch Code,Branch Store Name,Province (Khmer),District (English),District (Khmer),Latitude,Longitude,Matched Locations (<=12km),Total Keywords,All Search Keywords (Pipe Separated)\r\n";

  // Add Data Rows
  branches.forEach((b, index) => {
    const keywordsList = b.matched_keywords_12km || [];
    const pipeFormattedKeywords = keywordsList.join(' | ');

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
      matched_keywords_count: keywordsList.length,
      keywords_pipe_separated: pipeFormattedKeywords
    };

    const row = worksheet.addRow(rowData);
    row.height = 22;

    // Alternating zebra row background
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

    // CSV Row formatting
    const cleanKw = pipeFormattedKeywords.replace(/"/g, '""');
    const cleanCode = (b.store_code || '').replace(/"/g, '""');
    const cleanName = (b.store_name || '').replace(/"/g, '""');
    const cleanProv = (b.province_kh || '').replace(/"/g, '""');
    const cleanDistEn = (b.district_en || '').replace(/"/g, '""');
    const cleanDistKh = (b.district_kh || '').replace(/"/g, '""');

    csvContent += `${index + 1},"${cleanCode}","${cleanName}","${cleanProv}","${cleanDistEn}","${cleanDistKh}","${b.latitude || ''}","${b.longitude || ''}",${b.total_matched_places_12km || 0},${keywordsList.length},"${cleanKw}"\r\n`;
  });

  // Save Excel file
  await workbook.xlsx.writeFile(xlsxOutputPath);
  console.log(`✅ Saved Excel file (.xlsx): ${xlsxOutputPath}`);

  // Save CSV files
  fs.writeFileSync(csvOutputPath, csvContent, 'utf-8');
  fs.writeFileSync(dataCsvOutputPath, csvContent, 'utf-8');
  console.log(`✅ Saved CSV file (.csv): ${csvOutputPath}`);
  console.log(`✅ Saved Data CSV file (.csv): ${dataCsvOutputPath}`);
  console.log('=== EXPORT COMPLETE ===');
}

generateExports().catch(console.error);
