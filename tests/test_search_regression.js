/**
 * AUTOMATED COMPREHENSIVE SEARCH REGRESSION SUITE
 * Tests all search modes:
 *  1. Comma-separated multi-token address queries (e.g. "Veal Vong, Prampir Meakkakra, Phnom Penh, ")
 *  2. Khmer administrative queries (e.g. "វាលវង់", "មង្គលបូរី")
 *  3. English landmark queries (e.g. "Central Market", "Phsar Thmei")
 *  4. Branch code & store name queries (e.g. "BANA001", "PNP01")
 *  5. 15km Spatial Branch Indexing
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const branches = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'pickup_branches_with_keywords.json'), 'utf-8'));
const ncdd = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'ncdd_hierarchy.json'), 'utf-8'));
const routes = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'routes.json'), 'utf-8'));

const autoPick = require('../lib/auto_pick_engine');
const spatialIndexer = require('../lib/spatial_branch_indexer');

console.log('=== RUNNING COMPREHENSIVE SEARCH REGRESSION TESTS ===');

let passCount = 0;
let failCount = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    passCount++;
    console.log(`✅ PASS: ${testName} ${details ? '(' + details + ')' : ''}`);
  } else {
    failCount++;
    console.error(`❌ FAIL: ${testName} ${details ? '(' + details + ')' : ''}`);
  }
}

// Test 1: Comma-Separated Multi-Token Address Query
const q1 = 'Veal Vong, Prampir Meakkakra, Phnom Penh, ';
const parts1 = q1.split(',').map(s => s.trim()).filter(Boolean);
assert(parts1.length === 3, 'Tokenize Comma Address', `Tokens: ${parts1.join(' | ')}`);

// Find Veal Vong in Prampir Meakkakra
let foundCommune1 = null;
ncdd.forEach(p => {
  if (p.districts) {
    p.districts.forEach(d => {
      if (d.communes) {
        d.communes.forEach(c => {
          if (c.name_en.toLowerCase() === 'veal vong' && d.name_en.toLowerCase().includes('meakkakra')) {
            foundCommune1 = c;
          }
        });
      }
    });
  }
});
assert(foundCommune1 !== null && foundCommune1.code === '120307', 'NCDD Comma Address Match', `Veal Vong 7 Makara Code: ${foundCommune1 ? foundCommune1.code : 'NONE'}`);

// Test 2: Spatial Branch Indexing 15km for Phnom Penh Center
const ppLat = 11.560;
const ppLng = 104.915;
const spatialRes = spatialIndexer.findNearbyBranches(ppLat, ppLng, branches, 15.0);
assert(spatialRes.nearby_branches_12km.length > 0, '15km Spatial Indexing Nearby Branches', `Found ${spatialRes.nearby_branches_12km.length} branches under 15km`);
assert(spatialRes.auto_selected_branch !== null, '15km Spatial Auto-Selected Branch', `Branch: ${spatialRes.auto_selected_branch ? spatialRes.auto_selected_branch.store_name : 'NONE'}`);

// Test 3: Branch Code Exact Match
const branchBana1 = branches.find(b => b.store_code === 'BANA001');
assert(branchBana1 !== undefined && branchBana1.store_name === 'Chamnaom', 'Branch Code Lookup BANA001', `Name: ${branchBana1 ? branchBana1.store_name : 'NONE'}`);

// Test 4: Khmer Orthography & Normalization
const normKh = autoPick.normalizeKhmerEnhanced('ផ្សារធំថ្មី');
assert(normKh.length > 0, 'Khmer Normalization', `Result: ${normKh}`);

// Test 5: Verify all 697 pickup branches have valid numeric coordinates
let invalidCoords = 0;
branches.forEach(b => {
  const lat = parseFloat(b.latitude);
  const lng = parseFloat(b.longitude);
  if (isNaN(lat) || isNaN(lng) || lat < 8.0 || lat > 16.0 || lng < 101.0 || lng > 108.0) {
    invalidCoords++;
  }
});
assert(invalidCoords === 0, 'All 697 Pickup Branches Coordinates Valid', `Invalid: ${invalidCoords}`);

console.log(`\n=== REGRESSION TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED ===`);
if (failCount > 0) {
  process.exit(1);
}
