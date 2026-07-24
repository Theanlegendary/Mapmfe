/**
 * REGENERATE ALL EXPORT FORMATS AND TEXT FILES FROM CLEAN AUTHORITATIVE MASTER DATA
 * Regenerates:
 * 1. CLEAN_BRANCHES_FORMATTED.txt
 * 2. TOP_3_5_NEARBY_LOCATIONS_GOOGLE.txt
 * 3. BRANCH_DATA_TOP3_5_NEARBY.json
 * 4. all_700_branches_keywords_mapped.csv
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const branches = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'pickup_branches.json'), 'utf-8'));
const ncdd = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'ncdd_hierarchy.json'), 'utf-8'));
const spatialIndexer = require('../lib/spatial_branch_indexer');

console.log(`=== REGENERATING EXPORT FILES FOR ${branches.length} AUTHORITATIVE BRANCHES ===`);

// 1. Generate CLEAN_BRANCHES_FORMATTED.txt
let formattedTxt = '';

branches.forEach((b, idx) => {
  formattedTxt += `[BRANCH ${b.store_code}]\n`;
  formattedTxt += `Code      : ${b.store_code}\n`;
  formattedTxt += `Name      : ${b.store_name}\n`;
  formattedTxt += `Province  : ${b.province_kh || b.province_en}\n`;
  formattedTxt += `District  : ${b.district_en} (${b.district_kh || b.district_en})\n`;
  formattedTxt += `Commune   : ${b.commune_kh || b.store_name}\n`;
  formattedTxt += `Location  : ${b.latitude}, ${b.longitude}\n\n`;
});

fs.writeFileSync(path.join(ROOT_DIR, 'CLEAN_BRANCHES_FORMATTED.txt'), formattedTxt, 'utf-8');
console.log('✅ Generated CLEAN_BRANCHES_FORMATTED.txt');

// 2. Generate TOP_3_5_NEARBY_LOCATIONS_GOOGLE.txt & BRANCH_DATA_TOP3_5_NEARBY.json
let topTxt = '';
const topJson = [];

branches.forEach((b, idx) => {
  const spatialRes = spatialIndexer.findNearbyBranches(b.latitude, b.longitude, branches, 15.0);
  const nearby = (spatialRes.nearby_branches_12km || []).filter(n => n.branch_id !== b.store_code).slice(0, 5);

  topTxt += `[BRANCH #${idx + 1} - ${b.store_code}]\n`;
  topTxt += `Branch Code   : ${b.store_code}\n`;
  topTxt += `Branch Name   : ${b.store_name}\n`;
  topTxt += `Province      : ${b.province_en} (${b.province_kh})\n`;
  topTxt += `District      : ${b.district_en} (${b.district_kh})\n`;
  topTxt += `GPS Location  : ${b.latitude}, ${b.longitude}\n`;
  topTxt += `Top 3-5 Nearby Post Offices (Under 15km):\n`;

  const nearbyItems = [];
  nearby.forEach((n, nIdx) => {
    topTxt += `  ${nIdx + 1}. ${n.store_name} (${n.branch_id}) - ${n.distance_km} km\n`;
    nearbyItems.push({
      branch_id: n.branch_id,
      store_name: n.store_name,
      distance_km: n.distance_km
    });
  });

  if (nearby.length === 0) {
    topTxt += `  (No post office branches within 15km radius)\n`;
  }
  topTxt += `\n`;

  topJson.push({
    store_code: b.store_code,
    store_name: b.store_name,
    province_en: b.province_en,
    province_kh: b.province_kh,
    district_en: b.district_en,
    district_kh: b.district_kh,
    latitude: b.latitude,
    longitude: b.longitude,
    top_3_5_nearby_branches: nearbyItems
  });
});

fs.writeFileSync(path.join(ROOT_DIR, 'TOP_3_5_NEARBY_LOCATIONS_GOOGLE.txt'), topTxt, 'utf-8');
fs.writeFileSync(path.join(ROOT_DIR, 'BRANCH_DATA_TOP3_5_NEARBY.json'), JSON.stringify(topJson, null, 2), 'utf-8');
console.log('✅ Generated TOP_3_5_NEARBY_LOCATIONS_GOOGLE.txt & BRANCH_DATA_TOP3_5_NEARBY.json');

// 3. Generate all_700_branches_keywords_mapped.csv
let csv = 'Index,Store Code,Store Name,Province EN,Province KH,District EN,District KH,Latitude,Longitude\n';
branches.forEach((b, idx) => {
  csv += `${idx + 1},"${b.store_code}","${b.store_name}","${b.province_en}","${b.province_kh}","${b.district_en}","${b.district_kh}","${b.latitude}","${b.longitude}"\n`;
});
fs.writeFileSync(path.join(ROOT_DIR, 'all_700_branches_keywords_mapped.csv'), csv, 'utf-8');
console.log('✅ Generated all_700_branches_keywords_mapped.csv');
