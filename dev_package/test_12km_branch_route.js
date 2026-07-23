/**
 * ================================================================
 * 12KM BRANCH ROUTE & RELATED KEYWORDS — Integration Test Script
 * ================================================================
 * Demonstrates:
 * 1. GET /api/branch/:id
 * 2. Retrieving all 12km related location items and search keywords
 * ================================================================
 */

const BASE_URL = 'http://localhost:3001';

async function testBranchRoute(branchCode) {
  console.log(`\n🔍 Fetching Branch Route for: "${branchCode}"...`);
  const res = await fetch(`${BASE_URL}/api/branch/${encodeURIComponent(branchCode)}`);
  const data = await res.json();

  if (data.error) {
    console.error(`❌ Error: ${data.error}`);
    return;
  }

  console.log(`✅ Branch Code: ${data.branch_id}`);
  if (data.branch) {
    console.log(`   Branch Name : ${data.branch.store_name}`);
    console.log(`   Province    : ${data.branch.province_kh}`);
    console.log(`   District    : ${data.branch.district_en} (${data.branch.district_kh})`);
  }
  console.log(`📊 Total Directly Assigned Routes: ${data.total_direct_routes}`);
  console.log(`📍 Total Locations Under 12km Radius: ${data.total_locations_under_12km}`);
  console.log(`🔤 Total Search Keywords Under 12km Radius: ${data.search_keywords_12km.length}`);

  console.log(`\n📋 Sample Search Keywords under 12km (first 10):`);
  data.search_keywords_12km.slice(0, 10).forEach((kw, i) => {
    console.log(`   [${i + 1}] ${kw}`);
  });
}

async function main() {
  console.log('=== 12KM BRANCH ROUTE KEYWORD TEST ===\n');

  await testBranchRoute('PNPA060'); // Phnom Penh Phsar Thmei branch
  await testBranchRoute('SIES002'); // Siem Reap branch
  await testBranchRoute('MON02');   // Mondulkiri branch

  console.log('\n=== TEST COMPLETE ===');
}

main().catch(console.error);
