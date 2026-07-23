const fs = require('fs');
const path = require('path');

const EXPORT_DIR = path.join(__dirname, '..', 'it_team_data_export');
if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

// Utility to convert array of objects to CSV with UTF-8 BOM
function exportToCsv(filename, headers, rows) {
  const filePath = path.join(EXPORT_DIR, filename);
  
  function escapeCsvCell(val) {
    if (val === null || val === undefined) return '""';
    if (Array.isArray(val)) val = val.join(' | ');
    let str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  }

  const headerRow = headers.map(h => escapeCsvCell(h)).join(',');
  const dataRows = rows.map(row => 
    headers.map(h => escapeCsvCell(row[h])).join(',')
  );

  // Prepend UTF-8 BOM \uFEFF for Excel compatibility with Khmer script
  const csvContent = '\uFEFF' + [headerRow, ...dataRows].join('\r\n');
  fs.writeFileSync(filePath, csvContent, 'utf8');
  console.log(`✅ Exported ${rows.length} rows to ${filename}`);
}

console.log('🚀 Starting Data Export for IT Team...');

// 1. Export pickup_branches.json -> pickup_branches.csv
const pickupPath = path.join(__dirname, '..', 'data', 'pickup_branches.json');
if (fs.existsSync(pickupPath)) {
  const pickupData = JSON.parse(fs.readFileSync(pickupPath, 'utf8'));
  const headers = ['store_code', 'store_name', 'province_kh', 'district_en', 'district_kh', 'latitude', 'longitude', 'raw_delivery_store'];
  exportToCsv('pickup_branches.csv', headers, pickupData);
}

// 2. Export routes.json -> routes.csv
const routesPath = path.join(__dirname, '..', 'data', 'routes.json');
if (fs.existsSync(routesPath)) {
  const routesData = JSON.parse(fs.readFileSync(routesPath, 'utf8'));
  const headers = ['id', 'branch_id', 'market', 'market_kh', 'province', 'province_kh', 'district', 'district_kh', 'commune', 'commune_kh', 'village', 'village_kh', 'latitude', 'longitude', 'google_maps_url'];
  exportToCsv('routes.csv', headers, routesData);
}

// 3. Export famous_markets.json -> famous_markets.csv
const marketsPath = path.join(__dirname, '..', 'data', 'famous_markets.json');
if (fs.existsSync(marketsPath)) {
  const marketsData = JSON.parse(fs.readFileSync(marketsPath, 'utf8'));
  const headers = ['id', 'market', 'market_kh', 'province', 'province_kh', 'district', 'district_kh', 'latitude', 'longitude', 'aliases', 'search_keywords'];
  exportToCsv('famous_markets.csv', headers, marketsData);
}

// 4. Export curated_landmarks.json -> curated_landmarks.csv
const landmarksPath = path.join(__dirname, '..', 'data', 'curated_landmarks.json');
if (fs.existsSync(landmarksPath)) {
  const landmarksData = JSON.parse(fs.readFileSync(landmarksPath, 'utf8'));
  const headers = ['id', 'market', 'market_kh', 'object_type', 'province', 'province_kh', 'district', 'district_kh', 'commune', 'commune_kh', 'latitude', 'longitude', 'source', 'confidence', 'is_verified', 'google_maps_url', 'aliases'];
  exportToCsv('curated_landmarks.csv', headers, landmarksData);
}

// 5. Flatten & Export ncdd_hierarchy.json -> ncdd_hierarchy.csv
const ncddPath = path.join(__dirname, '..', 'data', 'ncdd_hierarchy.json');
if (fs.existsSync(ncddPath)) {
  const ncddData = JSON.parse(fs.readFileSync(ncddPath, 'utf8'));
  const flatNcdd = [];

  ncddData.forEach(p => {
    (p.districts || []).forEach(d => {
      (d.communes || []).forEach(c => {
        if (!c.villages || c.villages.length === 0) {
          flatNcdd.push({
            province_code: p.code,
            province_en: p.name_en,
            province_kh: p.name_kh,
            district_code: d.code,
            district_en: d.name_en,
            district_kh: d.name_kh,
            commune_code: c.code,
            commune_en: c.name_en,
            commune_kh: c.name_kh,
            village_code: '',
            village_en: '',
            village_kh: ''
          });
        } else {
          c.villages.forEach(v => {
            flatNcdd.push({
              province_code: p.code,
              province_en: p.name_en,
              province_kh: p.name_kh,
              district_code: d.code,
              district_en: d.name_en,
              district_kh: d.name_kh,
              commune_code: c.code,
              commune_en: c.name_en,
              commune_kh: c.name_kh,
              village_code: v.code,
              village_en: v.name_en,
              village_kh: v.name_kh
            });
          });
        }
      });
    });
  });

  const headers = ['province_code', 'province_en', 'province_kh', 'district_code', 'district_en', 'district_kh', 'commune_code', 'commune_en', 'commune_kh', 'village_code', 'village_en', 'village_kh'];
  exportToCsv('ncdd_hierarchy.csv', headers, flatNcdd);
}

// Copy documentation architecture file into export directory
const docSrc = path.join(__dirname, '..', 'docs', 'khmer_address_engine_architecture.md');
const docDest = path.join(EXPORT_DIR, 'README_IT_TEAM.md');
if (fs.existsSync(docSrc)) {
  fs.copyFileSync(docSrc, docDest);
  console.log('✅ Copied architecture guide to README_IT_TEAM.md');
}

console.log('🎉 All files successfully exported to folder: it_team_data_export');
