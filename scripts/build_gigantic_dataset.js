const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const EXPORT_DIR = path.join(ROOT_DIR, 'it_team_data_export');

if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

console.log('🚀 Building Gigantic Cambodia Search Database (Covering 100% Territory)...');

const giganticDatabase = [];
let idCounter = 1;

function escapeCsvCell(val) {
  if (val === null || val === undefined) return '""';
  let str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

// 1. Expand NCDD 2024 Admin Tree (Provinces, Districts, Communes, Villages)
const ncddPath = path.join(ROOT_DIR, 'data', 'ncdd_hierarchy.json');
if (fs.existsSync(ncddPath)) {
  const ncdd = JSON.parse(fs.readFileSync(ncddPath, 'utf8'));

  ncdd.forEach(p => {
    // Add Province Entry
    giganticDatabase.push({
      id: `CAM_PROV_${idCounter++}`,
      entity_level: 'province',
      full_search_text_kh: p.name_kh,
      full_search_text_en: p.name_en,
      province_code: p.code,
      province_kh: p.name_kh,
      province_en: p.name_en,
      district_code: '',
      district_kh: '',
      district_en: '',
      commune_code: '',
      commune_kh: '',
      commune_en: '',
      village_code: '',
      village_kh: '',
      village_en: '',
      landmark_name_kh: '',
      landmark_name_en: '',
      latitude: p.latitude || '',
      longitude: p.longitude || '',
      default_branch_id: p.name_en === 'Phnom Penh' ? 'PNP01' : '',
      search_keywords: `${p.name_kh} | ${p.name_en} | ខេត្ត${p.name_kh} | រាជធានី${p.name_kh}`
    });

    (p.districts || []).forEach(d => {
      // Add District Entry
      giganticDatabase.push({
        id: `CAM_DIST_${idCounter++}`,
        entity_level: 'district',
        full_search_text_kh: `${d.name_kh}, ${p.name_kh}`,
        full_search_text_en: `${d.name_en}, ${p.name_en}`,
        province_code: p.code,
        province_kh: p.name_kh,
        province_en: p.name_en,
        district_code: d.code,
        district_kh: d.name_kh,
        district_en: d.name_en,
        commune_code: '',
        commune_kh: '',
        commune_en: '',
        village_code: '',
        village_kh: '',
        village_en: '',
        landmark_name_kh: '',
        landmark_name_en: '',
        latitude: d.latitude || '',
        longitude: d.longitude || '',
        default_branch_id: '',
        search_keywords: `${d.name_kh} | ${d.name_en} | ខណ្ឌ${d.name_kh} | ស្រុក${d.name_kh} | ក្រុង${d.name_kh} | ${d.name_en} ${p.name_en}`
      });

      (d.communes || []).forEach(c => {
        // Add Commune Entry
        giganticDatabase.push({
          id: `CAM_COMM_${idCounter++}`,
          entity_level: 'commune',
          full_search_text_kh: `${c.name_kh}, ${d.name_kh}, ${p.name_kh}`,
          full_search_text_en: `${c.name_en}, ${d.name_en}, ${p.name_en}`,
          province_code: p.code,
          province_kh: p.name_kh,
          province_en: p.name_en,
          district_code: d.code,
          district_kh: d.name_kh,
          district_en: d.name_en,
          commune_code: c.code,
          commune_kh: c.name_kh,
          commune_en: c.name_en,
          village_code: '',
          village_kh: '',
          village_en: '',
          landmark_name_kh: '',
          landmark_name_en: '',
          latitude: c.latitude || '',
          longitude: c.longitude || '',
          default_branch_id: '',
          search_keywords: `${c.name_kh} | ${c.name_en} | សង្កាត់${c.name_kh} | ឃុំ${c.name_kh} | ${c.name_en} ${d.name_en}`
        });

        (c.villages || []).forEach(v => {
          // Add Village Entry
          giganticDatabase.push({
            id: `CAM_VILL_${idCounter++}`,
            entity_level: 'village',
            full_search_text_kh: `ភូមិ${v.name_kh}, ${c.name_kh}, ${d.name_kh}, ${p.name_kh}`,
            full_search_text_en: `Phum ${v.name_en}, ${c.name_en}, ${d.name_en}, ${p.name_en}`,
            province_code: p.code,
            province_kh: p.name_kh,
            province_en: p.name_en,
            district_code: d.code,
            district_kh: d.name_kh,
            district_en: d.name_en,
            commune_code: c.code,
            commune_kh: c.name_kh,
            commune_en: c.name_en,
            village_code: v.code,
            village_kh: v.name_kh,
            village_en: v.name_en,
            landmark_name_kh: '',
            landmark_name_en: '',
            latitude: v.latitude || '',
            longitude: v.longitude || '',
            default_branch_id: '',
            search_keywords: `${v.name_kh} | ${v.name_en} | ភូមិ${v.name_kh} | Phum ${v.name_en} | ${v.name_en} ${c.name_en} ${d.name_en}`
          });
        });
      });
    });
  });
}

// 2. Add Famous Markets & Commercial Centers
const marketsPath = path.join(ROOT_DIR, 'data', 'famous_markets.json');
if (fs.existsSync(marketsPath)) {
  const markets = JSON.parse(fs.readFileSync(marketsPath, 'utf8'));
  markets.forEach(m => {
    giganticDatabase.push({
      id: `CAM_MKT_${m.id || idCounter++}`,
      entity_level: 'market',
      full_search_text_kh: `${m.market_kh || m.market}, ${m.district_kh || ''}, ${m.province_kh || ''}`,
      full_search_text_en: `${m.market}, ${m.district || ''}, ${m.province || ''}`,
      province_code: '',
      province_kh: m.province_kh || m.province || '',
      province_en: m.province || '',
      district_code: '',
      district_kh: m.district_kh || m.district || '',
      district_en: m.district || '',
      commune_code: '',
      commune_kh: m.commune_kh || '',
      commune_en: m.commune || '',
      village_code: '',
      village_kh: m.village_kh || '',
      village_en: m.village || '',
      landmark_name_kh: m.market_kh || '',
      landmark_name_en: m.market || '',
      latitude: m.latitude || '',
      longitude: m.longitude || '',
      default_branch_id: m.branch_id || '',
      search_keywords: (m.search_keywords || []).join(' | ') || `${m.market_kh} | ${m.market}`
    });
  });
}

// 3. Add Curated Landmarks (Pagodas, Hospitals, Universities, Bridges, Boreys)
const landmarksPath = path.join(ROOT_DIR, 'data', 'curated_landmarks.json');
if (fs.existsSync(landmarksPath)) {
  const landmarks = JSON.parse(fs.readFileSync(landmarksPath, 'utf8'));
  landmarks.forEach(l => {
    giganticDatabase.push({
      id: `CAM_LMK_${l.id || idCounter++}`,
      entity_level: l.object_type || 'landmark',
      full_search_text_kh: `${l.market_kh || l.market}, ${l.district_kh || ''}, ${l.province_kh || ''}`,
      full_search_text_en: `${l.market}, ${l.district || ''}, ${l.province || ''}`,
      province_code: '',
      province_kh: l.province_kh || l.province || '',
      province_en: l.province || '',
      district_code: '',
      district_kh: l.district_kh || l.district || '',
      district_en: l.district || '',
      commune_code: '',
      commune_kh: l.commune_kh || '',
      commune_en: l.commune || '',
      village_code: '',
      village_kh: '',
      village_en: '',
      landmark_name_kh: l.market_kh || '',
      landmark_name_en: l.market || '',
      latitude: l.latitude || '',
      longitude: l.longitude || '',
      default_branch_id: l.branch_id || '',
      search_keywords: (l.search_keywords || []).join(' | ') || `${l.market_kh} | ${l.market}`
    });
  });
}

// 4. Add Logistics Pickup Hubs
const pickupPath = path.join(ROOT_DIR, 'data', 'pickup_branches.json');
if (fs.existsSync(pickupPath)) {
  const pickupData = JSON.parse(fs.readFileSync(pickupPath, 'utf8'));
  pickupData.forEach(p => {
    giganticDatabase.push({
      id: `CAM_HUB_${p.store_code}`,
      entity_level: 'pickup_hub',
      full_search_text_kh: `${p.store_name} (${p.store_code}), ${p.district_kh || p.district_en || ''}, ${p.province_kh || ''}`,
      full_search_text_en: `${p.raw_delivery_store || p.store_name}, ${p.district_en || ''}`,
      province_code: '',
      province_kh: p.province_kh || '',
      province_en: '',
      district_code: '',
      district_kh: p.district_kh || '',
      district_en: p.district_en || '',
      commune_code: '',
      commune_kh: '',
      commune_en: '',
      village_code: '',
      village_kh: '',
      village_en: '',
      landmark_name_kh: p.store_name,
      landmark_name_en: p.store_code,
      latitude: p.latitude || '',
      longitude: p.longitude || '',
      default_branch_id: p.store_code,
      search_keywords: `${p.store_code} | ${p.store_name} | ${p.raw_delivery_store}`
    });
  });
}

// Write to CSV
const headers = [
  'id', 'entity_level', 'full_search_text_kh', 'full_search_text_en',
  'province_code', 'province_kh', 'province_en',
  'district_code', 'district_kh', 'district_en',
  'commune_code', 'commune_kh', 'commune_en',
  'village_code', 'village_kh', 'village_en',
  'landmark_name_kh', 'landmark_name_en',
  'latitude', 'longitude', 'default_branch_id', 'search_keywords'
];

const headerRow = headers.map(h => escapeCsvCell(h)).join(',');
const dataRows = giganticDatabase.map(row => headers.map(h => escapeCsvCell(row[h])).join(','));
const csvContent = '\uFEFF' + [headerRow, ...dataRows].join('\r\n');

const outputPath = path.join(EXPORT_DIR, 'gigantic_cambodia_master_search_database.csv');
fs.writeFileSync(outputPath, csvContent, 'utf8');

console.log(`🎉 GIGANTIC Database Created Successfully!`);
console.log(`📊 Total Index Records: ${giganticDatabase.length}`);
console.log(`📁 Saved to: ${outputPath}`);
