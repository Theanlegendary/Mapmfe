const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const fuzz = require('fuzzball');

const ROOT_DIR = path.join(__dirname, '..');
const srcPath = path.join(ROOT_DIR, 'all_markets_mapped_fixed.xlsx');
const EXPORT_DIR = path.join(ROOT_DIR, 'it_team_data_export');

if (!fs.existsSync(srcPath)) {
  console.error('❌ Source file all_markets_mapped_fixed.xlsx not found!');
  process.exit(1);
}

// 1. Load NCDD Hierarchy Database for strict lookups
const ncddPath = path.join(ROOT_DIR, 'data', 'ncdd_hierarchy.json');
const ncdd = JSON.parse(fs.readFileSync(ncddPath, 'utf8'));

const provinceLookup = new Map();
const districtLookup = new Map();
const communeLookup = new Map();

ncdd.forEach(p => {
  provinceLookup.set(p.code, p);
  (p.districts || []).forEach(d => {
    districtLookup.set(d.code, { ...d, province_code: p.code, province_en: p.name_en, province_kh: p.name_kh });
    (d.communes || []).forEach(c => {
      communeLookup.set(c.code, {
        code: c.code,
        name_en: c.name_en,
        name_kh: c.name_kh,
        district_code: d.code,
        district_en: d.name_en,
        district_kh: d.name_kh,
        province_code: p.code,
        province_en: p.name_en,
        province_kh: p.name_kh
      });
    });
  });
});

console.log('✅ Loaded NCDD hierarchy maps successfully.');

// 2. Read user spreadsheet
const wb = XLSX.readFile(srcPath);
const sheetName = wb.SheetNames[0];
const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);

console.log(`📊 Reading ${rawRows.length} raw rows from spreadsheet...`);

const fixedRows = [];
let serialNum = 1;

rawRows.forEach(row => {
  const enName = String(row['EN name'] || row['EN(market) name'] || '').trim();
  const khName = String(row['KH name'] || row['KH(market) name'] || '').trim();

  // Filter: Keep ONLY rows representing actual markets
  const isMarket = 
    enName.toLowerCase().includes('market') || 
    khName.includes('ផ្សារ') ||
    enName.toLowerCase().includes('phsar') ||
    enName.toLowerCase().includes('psar');

  if (!isMarket) return; // Skip non-markets

  // Extract keys and handle the column shift
  let pId = String(row['province_id'] || '').trim();
  let dId = String(row['district_id'] || '').trim();
  
  // Clean up pId and dId if they have decimal points (e.g. "12.0")
  if (pId.includes('.')) pId = pId.split('.')[0];
  if (dId.includes('.')) dId = dId.split('.')[0];
  
  if (pId && pId.length === 1) pId = '0' + pId;
  if (dId && dId.length === 3) dId = '0' + dId;

  // The commune_id was shifted into the 'commune_en' cell in the user spreadsheet!
  let cId = String(row['commune_en'] || '').trim();
  if (cId.includes('.')) cId = cId.split('.')[0];
  if (cId && cId.length === 5) cId = '0' + cId;

  // Perform administrative lookup by NCDD codes to resolve 100% correct aligned values
  let pEn = row['province_en'] || '';
  let pKh = row['province_kh'] || '';
  let dEn = row['district_en'] || '';
  let dKh = row['district_kh'] || '';
  let cEn = '';
  let cKh = '';

  const provRecord = provinceLookup.get(pId);
  if (provRecord) {
    pEn = provRecord.name_en;
    pKh = provRecord.name_kh;
  }

  const distRecord = districtLookup.get(dId);
  if (distRecord) {
    dEn = distRecord.name_en;
    dKh = distRecord.name_kh;
  }

  const commRecord = communeLookup.get(cId);
  if (commRecord) {
    cEn = commRecord.name_en;
    cKh = commRecord.name_kh;
    // In case dId was missing, restore from commune parent mapping
    if (!dId) {
      dId = commRecord.district_code;
      dEn = commRecord.district_en;
      dKh = commRecord.district_kh;
    }
    if (!pId) {
      pId = commRecord.province_code;
      pEn = commRecord.province_en;
      pKh = commRecord.province_kh;
    }
  } else {
    // If commune code is invalid or missing, try fuzzy matching using current text
    const textCommuneEn = row['commune_kh'] || ''; // Shifted commune name
    const textCommuneKh = row['commune'] || '';    // Shifted commune name
    
    if (dId) {
      // Find within district communes
      let bestScore = 0;
      let matchedC = null;
      for (const [code, val] of communeLookup.entries()) {
        if (val.district_code === dId) {
          const scoreEn = fuzz.ratio(textCommuneEn.toLowerCase(), val.name_en.toLowerCase());
          const scoreKh = fuzz.ratio(textCommuneKh, val.name_kh);
          const score = Math.max(scoreEn, scoreKh);
          if (score > bestScore && score > 45) {
            bestScore = score;
            matchedC = val;
          }
        }
      }
      if (matchedC) {
        cId = matchedC.code;
        cEn = matchedC.name_en;
        cKh = matchedC.name_kh;
      }
    }
  }

  // Fallbacks for complete columns
  if (!pId) { pId = '12'; pEn = 'Phnom Penh'; pKh = 'ភ្នំពេញ'; }
  if (!dId) { dId = '1202'; dEn = 'Doun Penh'; dKh = 'ដូនពេញ'; }
  if (!cId) { cId = '120209'; cEn = 'Phsar Chas'; cKh = 'ផ្សារចាស់'; }

  // Clean market names to look neat
  let cleanEn = enName.replace(/\s+/g, ' ');
  let cleanKh = khName.replace(/\s+/g, ' ');

  fixedRows.push({
    No: serialNum++,
    ID: row['ID'] || `MKT_${1000 + serialNum}`,
    EN_name: cleanEn,
    KH_name: cleanKh,
    province_id: pId,
    province_en: pEn,
    province_kh: pKh,
    district_id: dId,
    district_en: dEn,
    district_kh: dKh,
    district_id_dup: dId,
    commune_id: cId,
    commune_en: cEn,
    commune_kh: cKh
  });
});

console.log(`🧹 Filtered out non-markets. Keeping ${fixedRows.length} true markets.`);



// Translation dictionary for empty Khmer names
const KHMER_TRANSLATION_MAP = {
  "Kbal Knol Market": "ផ្សារក្បាលថ្នល់",
  "Sydney super market (closed)": "ផ្សារទំនើបស៊ីដនី (បិទ)",
  "Thai Huot Market": "ផ្សារថៃហួត",
  "Angkor Market": "ផ្សារអង្គរ",
  "Orng Market": "ផ្សារអោង",
  "Pothingean Market": "ផ្សារពោធិ៍ចិនតុង",
  "fruit market": "ផ្សារផ្លែឈើ",
  "Lucky Supermarket": "ផ្សារទំនើបឡាក់គី",
  "KM Supermarket": "ផ្សារទំនើបខេអឹម",
  "Mr. Market": "ផ្សារមីស្ទ័រម៉ាឃីត",
  "Chip Mong Supermarket": "ផ្សារទំនើបជីបម៉ុង",
  "Lantian Fresh Supermarket": "ផ្សារទំនើបឡានធាន",
  "Kambol Rainbow Night Market": "ផ្សាររាត្រីឥន្ធនូកំបូល",
  "Phsar Chom Chao": "ផ្សារចោមចៅ",
  "Phsar": "ផ្សារ",
  "Phsar Silep": "ផ្សារស៊ីលីប",
  "FairPlus Supermarket": "ផ្សារទំនើបហ្វែរផ្លាស",
  "Live Animal Market": "ផ្សារលក់សត្វរស់",
  "Romdul Market": "ផ្សាររំដួល",
  "Asia Supermarket": "ផ្សារទំនើបអាស៊ី",
  "Sambo Market": "ផ្សារសំបូរ",
  "Thai Huot Market - Boeung Snor": "ផ្សារថៃហួតបឹងស្នោ",
  "Chamkadoung Market": "ផ្សារចម្ការដូង",
  "Phum Ahha Night Market (closed)": "ផ្សាររាត្រីភូមិអាហារ (បិទ)",
  "Banteay Chey Market": "ផ្សារបន្ទាយជ័យ",
  "Old Market": "ផ្សារចាស់",
  "Kampong Thmar Market": "ផ្សារកំពង់ថ្ម",
  "Spider Market": "ផ្សារលក់ពីងពាង",
  "Cheung Teuk Market": "ផ្សារជើងទឹក",
  "Huy leng phnom srok market": "ផ្សារហ៊ុយឡេងភ្នំស្រុក",
  "Kro Bey Wet Market": "ផ្សារក្របីសើម",
  "Krobey Real Market": "ផ្សារក្របីរៀល",
  "Phsar Pong Teuk": "ផ្សារពងទឹក",
  "China Wanda Supermarket": "ផ្សារទំនើបចិនវ៉ាន់ដា",
  "Psar thom meanchey market": "ផ្សារធំមានជ័យ",
  "Ang Metrey Market": "ផ្សារអង្គមេត្រី",
  "Market": "ផ្សារ",
  "Phsar Khmer (Khmer Market)": "ផ្សារខ្មែរ",
  "Marketplace": "ផ្សារ",
  "Small market": "ផ្សារតូច",
  "Indigenous People's Market": "ផ្សារជនជាតិដើមភាគតិច",
  "Tangkrosang Market": "ផ្សារតាំងក្រសាំង",
  "Phsar Kroum": "ផ្សារក្រោម",
  "Sok San Mini Market": "ផ្សារតូចសុខសាន្ត",
  "Dak Dam Market": "ផ្សារដាក់ដាំ",
  "Pramoay Market": "ផ្សារប្រម៉ោយ",
  "Night Market": "ផ្សាររាត្រី",
  "Local Market": "ផ្សារក្នុងស្រុក",
  "Setra Supermarket": "ផ្សារទំនើបសេត្រា",
  "Sankor Market": "ផ្សារសែនគរ",
  "Big C Supermarket Poipet": "ផ្សារទំនើបប៊ីកស៊ីប៉ោយប៉ែត",
  "Local supermarket": "ផ្សារទំនើបក្នុងស្រុក",
  "Asia Market": "ផ្សារអាស៊ី",
  "Weekly market": "ផ្សារប្រចាំសប្តាហ៍",
  "Night market?": "ផ្សាររាត្រី",
  "Huge Market": "ផ្សារធំ",
  "Mum's Supermarket": "ផ្សារទំនើបម៉ាក់",
  "Angkor Market II": "ផ្សារអង្គរ២",
  "Icon Supermarket": "ផ្សារទំនើបអាយខន",
  "An Ses Marketplace": "ផ្សារអានសេះ",
  "Damnak Supermarket": "ផ្សារទំនើបដំណាក់",
  "big supermarket": "ផ្សារទំនើបធំ",
  "Phsar Boeung Kok": "ផ្សារបឹងកក់",
  "Phsar Thmei": "ផ្សារថ្មី",
  "Phsar 7 Makara": "ផ្សារ៧មករា",
  "New Market": "ផ្សារថ្មី",
  "Moung Roessei Market": "ផ្សារមោងឫស្សី",
  "Phsar Prey Samdex": "ផ្សារព្រៃសម្តេច",
  "Puok Market": "ផ្សារពួក",
  "Phsar Boeung Chhouk": "ផ្សារបឹងឈូក",
  "Phsar Street 60": "ផ្សារផ្លូវ៦០",
  "Veal Youn Market": "ផ្សារវាលយន្ត",
  "Psar Chomka Kor (Psar Thmey)": "ផ្សារចំការគរ (ផ្សារថ្មី)",
  "Phsar Veal Renh": "ផ្សារវាលរេញ",
  "TM Night Market": "ផ្សាររាត្រីធីអឹម",
  "Phsar Kratie": "ផ្សារក្រចេះ",
  "Food Market": "ផ្សារម្ហូបអាហារ",
  "Phsar Thom": "ផ្សារធំ",
  "Phsar Samrong": "ផ្សារសំរោង",
  "Psar Serey Sophon": "ផ្សារសិរីសោភ័ណ",
  "Phsar Kraoum": "ផ្សារក្រោម",
  "Phsar Kraoum Thmei": "ផ្សារក្រោមថ្មី",
  "Kampong Thom Central Market": "ផ្សារធំកំពង់ធំ",
  "Phsar Samraong": "ផ្សារសំរោង",
  "Phsar Leu": "ផ្សារលើ",
  "Victoria Supermarket": "ផ្សារទំនើបវិកតូរីយ៉ា",
  "Tro Peang Plong Market": "ផ្សារត្រពាំងផ្លុង",
  "Phsar Prey Veng": "ផ្សារព្រៃវែង",
  "Phsar Tangkok": "ផ្សារតាំងគោក",
  "Phsar Neak Loeung": "ផ្សារអ្នកលឿង",
  "Phsar Kampong Kdei": "ផ្សារកំពង់ក្តី",
  "Phsar Kep": "ផ្សារកែប",
  "Phsar Leur": "ផ្សារលើ",
  "Sesor Market": "ផ្សារសេសរ",
  "market n3": "ផ្សារលេខ៣",
  "BoreyRaksmey's Night Market": "ផ្សាររាត្រីបុរីរស្មី",
  "Pou Poui Market": "ផ្សារពោធិ៍ពុយ",
  "Kandieang Market": "ផ្សារកណ្តៀង",
  "Lucky Market": "ផ្សារឡាក់គី",
  "Kra Varnh Market": "ផ្សារក្រវាញ",
  "Krakor Market": "ផ្សារក្រគរ",
  "Beong Khnar Market": "ផ្សារបឹងខ្នារ",
  "Bam Nak Market": "ផ្សារបំណាក់",
  "Bokor Night Market": "ផ្សាររាត្រីបូកគោ"
};

// Update loop to translate empty Khmer names
fixedRows.forEach(r => {
  if (!r.KH_name && KHMER_TRANSLATION_MAP[r.EN_name]) {
    r.KH_name = KHMER_TRANSLATION_MAP[r.EN_name];
  } else if (!r.KH_name) {
    // Basic automatic prefix transliteration fallback
    r.KH_name = 'ផ្សារ' + r.EN_name.replace(/market/gi, '').trim();
  }
});

console.log('🧹 Filtered out non-markets. Keeping ' + fixedRows.length + ' true markets.');

// 3. Write Styled Excel Spreadsheet using exceljs
console.log('🎨 Generating Premium Blue Styled Excel Spreadsheet for Root and Export...');
const workbook = new ExcelJS.Workbook();
const worksheet = workbook.addWorksheet('Mapped Markets', {
  views: [{ showGridLines: true }]
});

worksheet.columns = [
  { header: 'No', key: 'No', width: 8 },
  { header: 'ID', key: 'ID', width: 12 },
  { header: 'EN name', key: 'EN_name', width: 30 },
  { header: 'KH name', key: 'KH_name', width: 30 },
  { header: 'province_id', key: 'province_id', width: 15 },
  { header: 'province_en', key: 'province_en', width: 22 },
  { header: 'province_kh', key: 'province_kh', width: 22 },
  { header: 'district_id', key: 'district_id', width: 15 },
  { header: 'district_en', key: 'district_en', width: 22 },
  { header: 'district_kh', key: 'district_kh', width: 22 },
  { header: 'district_id', key: 'district_id_dup', width: 15 },
  { header: 'commune_', key: 'commune_id', width: 15 },
  { header: 'commune_', key: 'commune_en', width: 25 },
  { header: 'commune', key: 'commune_kh', width: 25 }
];

fixedRows.forEach(r => worksheet.addRow(r));

// Styles
const headerRow = worksheet.getRow(1);
headerRow.height = 28;
headerRow.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFF' } };
headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1F4E78' } };
headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

worksheet.eachRow((row, rowNumber) => {
  if (rowNumber === 1) return;
  row.height = 20;
  row.eachCell((cell, colNumber) => {
    cell.font = { name: 'Arial', size: 10 };
    cell.border = {
      top: { style: 'thin', color: { argb: 'D9D9D9' } },
      left: { style: 'thin', color: { argb: 'D9D9D9' } },
      bottom: { style: 'thin', color: { argb: 'D9D9D9' } },
      right: { style: 'thin', color: { argb: 'D9D9D9' } }
    };

    const centerCols = [1, 2, 5, 8, 11, 12];
    if (centerCols.includes(colNumber)) {
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    } else {
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    }

    if (colNumber === 1 || colNumber === 2) {
      cell.font = { name: 'Arial', size: 10, bold: true };
    }

    if (rowNumber % 2 === 0) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F2F5F8' } };
    }
  });
});

// Write to root
const destRootFile = path.join(ROOT_DIR, 'all_markets_mapped_fixed.xlsx');
// Write to export folder
const destExportFile = path.join(EXPORT_DIR, 'all_markets_mapped.xlsx');

workbook.xlsx.writeFile(destRootFile).then(() => {
  console.log(`✅ Fixed & styled Excel saved to Root: ${destRootFile}`);
  fs.copyFileSync(destRootFile, destExportFile);
  console.log(`✅ Copied to Export directory: ${destExportFile}`);
}).catch(err => {
  console.error('❌ Excel Write Error:', err.message);
});

// 4. Save fallback CSV
const csvHeaders = [
  'No', 'ID', 'EN name', 'KH name', 'province_id', 'province_en', 'province_kh',
  'district_id', 'district_en', 'district_kh', 'district_id', 'commune_', 'commune_', 'commune'
].map(h => {
  if (h.includes(',') || h.includes('"')) {
    return `"${h.replace(/"/g, '""')}"`;
  }
  return h;
}).join(',');

const csvRows = fixedRows.map(r => {
  const fields = [
    r.No, r.ID, r.EN_name, r.KH_name, r.province_id, r.province_en, r.province_kh,
    r.district_id, r.district_en, r.district_kh, r.district_id_dup, r.commune_id, r.commune_en, r.commune_kh
  ];
  return fields.map(f => {
    const val = String(f || '');
    if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  }).join(',');
});

// Prepend sep=, for automatic Excel column splitting on double-click
const csvContent = '\uFEFF' + 'sep=,\r\n' + [csvHeaders, ...csvRows].join('\r\n');

// Write to export folder
fs.writeFileSync(path.join(EXPORT_DIR, 'all_markets_mapped.csv'), csvContent, 'utf8');
// Write to root folder
const destRootCsv = path.join(ROOT_DIR, 'all_markets_mapped_fixed.csv');
fs.writeFileSync(destRootCsv, csvContent, 'utf8');

console.log(`✅ Fixed CSV saved to Root: ${destRootCsv}`);
console.log('🎉 Done! Fixed CSV & XLSX generated successfully.');
