/**
 * ================================================================
 * AUTO-PICK API — Integration Test + Demo Script
 * ================================================================
 * Run this to test the auto-pick engine on your local server.
 * Usage:  node dev_package/test_auto_pick.js
 * ================================================================
 */

const BASE_URL = 'http://localhost:3000';

async function testAutoPick(query, province = '') {
  const url = `${BASE_URL}/api/auto-pick?q=${encodeURIComponent(query)}&province=${encodeURIComponent(province)}`;
  const res = await fetch(url);
  const data = await res.json();
  
  const status = data.auto_pick ? '✅ AUTO-PICK' : '📋 DROPDOWN';
  const result = data.auto_pick_result;
  const top    = data.candidates && data.candidates[0];
  
  console.log(`\n${status} | Query: "${query}"${province ? ` (${province})` : ''}`);
  if (data.auto_pick && result) {
    console.log(`  → ${result.market} / ${result.market_kh}`);
    console.log(`  → Confidence: ${result.confidence}%`);
    console.log(`  → Province: ${result.province_kh || result.province}`);
    if (result.commune_code) console.log(`  → Commune Code: ${result.commune_code}`);
  } else if (top) {
    console.log(`  Best guess: ${top.market} / ${top.market_kh} (${top.confidence}% — needs user confirmation)`);
  } else {
    console.log(`  ❌ No results found`);
  }
  if (data.phonetic_match) {
    console.log(`  → Phonetic matched: "${data.phonetic_match}"`);
  }
}

async function testConfirmPick(query, market, market_kh, province_kh = '') {
  const res = await fetch(`${BASE_URL}/api/confirm-pick`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, market, market_kh, province_kh })
  });
  const data = await res.json();
  console.log(`\n📚 LEARNED: "${query}" → ${market}`);
  return data;
}

async function testVariants() {
  const res = await fetch(`${BASE_URL}/api/variants?limit=10`);
  const data = await res.json();
  console.log(`\n📊 LEARNED VARIANTS (top ${Math.min(10, data.total)}):`);
  data.variants.forEach(v => {
    console.log(`  "${v.variant_query}" → ${v.canonical_en} (hits: ${v.hit_count}, confidence: ${v.learn_confidence}%)`);
  });
}

async function main() {
  console.log('=== AUTO-PICK ENGINE TEST ===\n');

  // Test 1: Well-known phonetic names (should always auto-pick)
  await testAutoPick('phsar thmei');
  await testAutoPick('central market');
  await testAutoPick('russian market');
  await testAutoPick('russei keo');

  // Test 2: Partial / informal names
  await testAutoPick('olympic');
  await testAutoPick('orussey');

  // Test 3: Khmer input
  await testAutoPick('ផ្សារធំថ្មី');
  await testAutoPick('ផ្សារអូឡាំពិក');

  // Test 4: Common misspellings
  await testAutoPick('psar tmei');
  await testAutoPick('rusei keo');
  await testAutoPick('tuol tum poung');

  // Test 5: With province scope
  await testAutoPick('phsar chas', 'siem reap');
  await testAutoPick('phsar leu', 'battambang');

  // Test 6: Simulate user confirming a pick → learning
  console.log('\n--- Teaching the system a new variant ---');
  await testConfirmPick(
    'russi keo market',          // user typed this
    'Russei Keo Market',          // canonical English name
    'ផ្សារឫស្សីកែវ',              // canonical Khmer name
    'ភ្នំពេញ'                     // province
  );
  
  // Now test that it resolves instantly
  console.log('\n--- After learning, same query should auto-pick ---');
  await testAutoPick('russi keo market');

  // Test 7: View all learned variants
  await testVariants();

  console.log('\n=== TEST COMPLETE ===');
}

main().catch(console.error);
