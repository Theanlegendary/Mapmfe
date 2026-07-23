const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const EXPORT_DIR = path.join(ROOT_DIR, 'it_team_data_export');

if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

function copyFileIfExist(srcName, destName) {
  const srcPath = path.join(ROOT_DIR, srcName);
  const destPath = path.join(EXPORT_DIR, destName);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`✅ Copied raw file: ${destName}`);
  }
}

function exportJsonToCsv(jsonRelativePath, csvName, headers) {
  const jsonPath = path.join(ROOT_DIR, jsonRelativePath);
  if (!fs.existsSync(jsonPath)) return;

  try {
    const raw = fs.readFileSync(jsonPath, 'utf8');
    const data = JSON.parse(raw);
    const rows = Array.isArray(data) ? data : (data.items || data.records || []);

    if (rows.length === 0) {
      console.log(`ℹ️  Skipped empty file: ${jsonRelativePath}`);
      return;
    }

    const keys = headers || Object.keys(rows[0] || {});
    
    function escapeCsvCell(val) {
      if (val === null || val === undefined) return '""';
      if (typeof val === 'object') val = JSON.stringify(val);
      let str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    }

    const headerRow = keys.map(k => escapeCsvCell(k)).join(',');
    const dataRows = rows.map(r => keys.map(k => escapeCsvCell(r[k])).join(','));
    const csvContent = '\uFEFF' + [headerRow, ...dataRows].join('\r\n');

    fs.writeFileSync(path.join(EXPORT_DIR, csvName), csvContent, 'utf8');
    console.log(`✅ Exported ${rows.length} rows to ${csvName}`);
  } catch (err) {
    console.error(`❌ Error exporting ${jsonRelativePath}:`, err.message);
  }
}

console.log('🚀 Adding More Raw Data Files for IT Team...');

// 1. Copy original Excel administrative database
copyFileIfExist('ncdd_admin_database_25provinces__14.10.2024.xlsx', 'ncdd_admin_database_25provinces_2024.xlsx');

// 2. Copy pickup branch lookup CSV
copyFileIfExist('pickup_branch_lookup.csv', 'raw_pickup_branch_lookup.csv');

// 3. Export geocoding cache if present
exportJsonToCsv('data/geocoding_cache.json', 'geocoding_cache.csv');

// 4. Create Master Combined Cambodia Location Database CSV
console.log('📦 Building Master Combined Location Dataset...');

const masterLocations = [];

// Load NCDD Divisions
const ncddPath = path.join(ROOT_DIR, 'data', 'ncdd_hierarchy.json');
if (fs.existsSync(ncddPath)) {
  const ncdd = JSON.parse(fs.readFileSync(ncddPath, 'utf8'));
  ncdd.forEach(p => {
    (p.districts || []).forEach(d => {
      (d.communes || []).forEach(c => {
        (c.villages || []).forEach(v => {
          masterLocations.push({
            location_type: 'village',
            location_id: v.code,
            name_en: v.name_en,
            name_kh: v.name_kh,
            commune_kh: c.name_kh,
            district_kh: d.name_kh,
            province_kh: p.name_kh,
            latitude: '',
            longitude: '',
            branch_id: '',
            source: 'NCDD_2024'
          });
        });
      });
    });
  });
}

// Load Famous Markets
const marketsPath = path.join(ROOT_DIR, 'data', 'famous_markets.json');
if (fs.existsSync(marketsPath)) {
  const markets = JSON.parse(fs.readFileSync(marketsPath, 'utf8'));
  markets.forEach(m => {
    masterLocations.push({
      location_type: 'market',
      location_id: m.id || '',
      name_en: m.market || '',
      name_kh: m.market_kh || '',
      commune_kh: m.commune_kh || '',
      district_kh: m.district_kh || m.district || '',
      province_kh: m.province_kh || m.province || '',
      latitude: m.latitude || '',
      longitude: m.longitude || '',
      branch_id: m.branch_id || '',
      source: 'FAMOUS_MARKETS'
    });
  });
}

// Load Curated Landmarks
const landmarksPath = path.join(ROOT_DIR, 'data', 'curated_landmarks.json');
if (fs.existsSync(landmarksPath)) {
  const landmarks = JSON.parse(fs.readFileSync(landmarksPath, 'utf8'));
  landmarks.forEach(l => {
    masterLocations.push({
      location_type: l.object_type || 'landmark',
      location_id: l.id || '',
      name_en: l.market || '',
      name_kh: l.market_kh || '',
      commune_kh: l.commune_kh || '',
      district_kh: l.district_kh || l.district || '',
      province_kh: l.province_kh || l.province || '',
      latitude: l.latitude || '',
      longitude: l.longitude || '',
      branch_id: l.branch_id || '',
      source: 'CURATED_LANDMARKS'
    });
  });
}

// Load Routes
const routesPath = path.join(ROOT_DIR, 'data', 'routes.json');
if (fs.existsSync(routesPath)) {
  const routes = JSON.parse(fs.readFileSync(routesPath, 'utf8'));
  routes.forEach(r => {
    masterLocations.push({
      location_type: 'route_mapping',
      location_id: r.id || '',
      name_en: r.market || r.village || '',
      name_kh: r.market_kh || r.village_kh || '',
      commune_kh: r.commune_kh || '',
      district_kh: r.district_kh || r.district || '',
      province_kh: r.province_kh || r.province || '',
      latitude: r.latitude || '',
      longitude: r.longitude || '',
      branch_id: r.branch_id || '',
      source: 'ROUTES_MAPPING'
    });
  });
}

// Write Master CSV
const masterHeaders = ['location_type', 'location_id', 'name_en', 'name_kh', 'commune_kh', 'district_kh', 'province_kh', 'latitude', 'longitude', 'branch_id', 'source'];
function escapeCsvCell(val) {
  if (val === null || val === undefined) return '""';
  let str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}
const masterHeaderRow = masterHeaders.map(h => escapeCsvCell(h)).join(',');
const masterDataRows = masterLocations.map(row => masterHeaders.map(h => escapeCsvCell(row[h])).join(','));
const masterContent = '\uFEFF' + [masterHeaderRow, ...masterDataRows].join('\r\n');

fs.writeFileSync(path.join(EXPORT_DIR, 'master_cambodia_locations_all_combined.csv'), masterContent, 'utf8');
console.log(`✅ Exported MASTER dataset with ${masterLocations.length} records to master_cambodia_locations_all_combined.csv`);

console.log('🎉 All raw data files successfully added to it_team_data_export!');
