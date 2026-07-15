/**
 * Regression Test Suite for Smart-Find
 * 
 * This test suite contains every address that has ever failed or caused issues.
 * All code changes must pass ALL tests in this suite.
 * 
 * Run with: node test_regression.js
 */

const fetch = require('node-fetch');

const PORT = process.env.PORT || 3000;
const API = `http://127.0.0.1:${PORT}`;

// Test result tracking
let passed = 0;
let failed = 0;
const failures = [];

// ============================================================
// REGRESSION TEST CASES
// Every address that has ever failed should be added here
// ============================================================

const regressionTests = [
  // ----- ENTITY EXTRACTION TESTS -----
  {
    id: 'ENTITY-001',
    name: 'Extract village entity from sentence',
    query: 'ផ្ទះនៅជិតភូមិត្រពាំងល្វា',
    expectedEntity: 'ត្រពាំងល្វា',
    expectedType: 'village',
    category: 'entity-extraction'
  },
  {
    id: 'ENTITY-002',
    name: 'Extract market entity from sentence',
    query: 'ផ្ទះនៅជិតផ្សារទួលពង្រ',
    expectedEntity: 'ទួលពង្រ',
    expectedType: 'market',
    category: 'entity-extraction'
  },
  {
    id: 'ENTITY-003',
    name: 'Extract Borey from sentence',
    query: 'ក្បែរបុរីភ្នំពេញផាក',
    expectedEntity: 'ភ្នំពេញផាក',
    expectedType: 'borey',
    category: 'entity-extraction'
  },
  {
    id: 'ENTITY-004',
    name: 'Extract Borey Sony',
    query: 'ម្ដុំបុរីសុណិន',
    expectedEntity: 'សុណិន',
    expectedType: 'borey',
    category: 'entity-extraction'
  },
  {
    id: 'ENTITY-005',
    name: 'Extract market with filler words',
    query: 'ផ្សារព្រៃទា',
    expectedEntity: 'ព្រៃទា',
    expectedType: 'market',
    category: 'entity-extraction'
  },
  {
    id: 'ENTITY-006',
    name: 'Extract Street number',
    query: 'ផ្លូវ 271',
    expectedEntity: '271',
    expectedType: 'road',
    category: 'entity-extraction'
  },
  {
    id: 'ENTITY-007',
    name: 'Extract The Star Quateria',
    query: 'The Star Quateria',
    expectedEntity: 'ស្តារគ្វាទៀរ',
    expectedType: 'landmark',
    category: 'entity-extraction'
  },
  {
    id: 'ENTITY-008',
    name: 'Extract multiple entities - market + borey',
    query: 'ជិតផ្សារទួលពង្រក្បែរបុរីភ្នំពេញផាក',
    expectedEntityCount: 2,
    expectedEntities: ['ទួលពង្រ', 'ភ្នំពេញផាក'],
    category: 'entity-extraction'
  },

  // ----- ADDRESS RESOLUTION TESTS -----
  {
    id: 'ADDR-001',
    name: 'ភូមិត្រពាំងល្វា - Village in Phnom Penh',
    query: 'ភូមិត្រពាំងល្វា',
    shouldFind: true,
    // This village is in Pur SenChey district, Phnom Penh
    category: 'address-resolution'
  },
  {
    id: 'ADDR-002',
    name: 'ផ្សារទួលពង្រ - Market in Phnom Penh',
    query: 'ផ្សារទួលពង្រ',
    shouldFind: true,
    category: 'address-resolution'
  },
  {
    id: 'ADDR-003',
    name: 'Borey Phnom Penh Park',
    query: 'Borey Phnom Penh Park',
    shouldFind: true,
    category: 'address-resolution'
  },
  {
    id: 'ADDR-004',
    name: 'Borey Sony',
    query: 'Borey Sony',
    shouldFind: true,
    category: 'address-resolution'
  },
  {
    id: 'ADDR-005',
    name: 'ផ្សារព្រៃទា - Market',
    query: 'ផ្សារព្រៃទា',
    shouldFind: true,
    category: 'address-resolution'
  },
  {
    id: 'ADDR-006',
    name: 'Street 271',
    query: 'Street 271',
    shouldFind: true,
    category: 'address-resolution'
  },
  {
    id: 'ADDR-007',
    name: 'The Star Quateria',
    query: 'The Star Quateria',
    shouldFind: true,
    category: 'address-resolution'
  },

  // ----- NATURAL LANGUAGE SENTENCE TESTS -----
  {
    id: 'SENT-001',
    name: 'Full sentence with village',
    query: 'ផ្ទះនៅជិតក្បែរខាងក្រោយទល់មុខច្រកចូលទីតាំងម្ដុំភូមិត្រពាំងល្វា',
    shouldFind: true,
    expectedEntity: 'ត្រពាំងល្វា',
    category: 'sentence'
  },
  {
    id: 'SENT-002',
    name: 'Full sentence with market',
    query: 'ផ្ទះនៅជិតក្បែរខាងក្រោយទល់មុខច្រកចូលទីតាំងម្ដុំផ្សារទួលពង្រ',
    shouldFind: true,
    expectedEntity: 'ទួលពង្រ',
    category: 'sentence'
  },
  {
    id: 'SENT-003',
    name: 'Full sentence with Borey',
    query: 'ផ្ទះនៅជិតក្បែរខាងក្រោយទល់មុខច្រកចូលទីតាំងម្ដុំបុរីភ្នំពេញផាក',
    shouldFind: true,
    expectedEntity: 'ភ្នំពេញផាក',
    category: 'sentence'
  },
  {
    id: 'SENT-004',
    name: 'Full sentence with multiple entities',
    query: 'ផ្ទះនៅជិតក្បែរខាងក្រោយទល់មុខច្រកចូលទីតាំងម្ដុំផ្សារទួលពង្រក្បែរបុរីភ្នំពេញផាក',
    shouldFind: true,
    expectedEntityCount: 2,
    category: 'sentence'
  },

  // ----- PREVIOUS REGRESSION TESTS (must continue to pass) -----
  {
    id: 'REG-001',
    name: 'Direct Coordinates Search',
    query: '11.5696, 104.9211',
    shouldFind: true,
    category: 'regression'
  },
  {
    id: 'REG-002',
    name: 'Khmer Market Search - Phsar Thmey',
    query: 'ផ្សារធំថ្មី',
    shouldFind: true,
    category: 'regression'
  },
  {
    id: 'REG-003',
    name: 'Spelling Correction Search',
    query: 'Phsar Thmey',
    shouldFind: true,
    category: 'regression'
  },
  {
    id: 'REG-004',
    name: 'Famous Market Static Override - Ang Tasom',
    query: 'Ang Tasom',
    shouldFind: true,
    category: 'regression'
  },
  {
    id: 'REG-005',
    name: 'Standard Province Market Search',
    query: 'Kampong Cham Market',
    province: 'Kampong Cham',
    shouldFind: true,
    category: 'regression'
  },
  {
    id: 'REG-006',
    name: 'Khmer Village Prefix Stripping',
    query: 'ភូមិត្នោត',
    province: 'Prey Veng',
    shouldFind: true,
    category: 'regression'
  },
  {
    id: 'REG-007',
    name: 'Khmer District Prefix Stripping',
    query: 'ស្រុកកញ្ជ្រៀច',
    province: 'Prey Veng',
    shouldFind: true,
    category: 'regression'
  },

  // ----- FUZZY MATCHING TESTS -----
  {
    id: 'FUZZY-001',
    name: 'Phsar Thmey variations',
    query: 'phsar thmey',
    shouldFind: true,
    expectedMarket: 'ផ្សារធំថ្មី',
    category: 'fuzzy'
  },
  {
    id: 'FUZZY-002',
    name: 'Central Market alias',
    query: 'central market',
    shouldFind: true,
    category: 'fuzzy'
  },

  // ----- GOOGLE MAPS LINK TESTS -----
  {
    id: 'GMAP-001',
    name: 'Google Maps short link',
    query: 'https://maps.app.goo.gl/abc123',
    shouldFind: false, // Will fail to resolve but should not crash
    category: 'google-maps'
  },
  {
    id: 'GMAP-002',
    name: 'Google Maps coordinates link',
    query: 'https://www.google.com/maps?q=11.556,104.928',
    shouldFind: true,
    category: 'google-maps'
  },

  // ----- EDGE CASES -----
  {
    id: 'EDGE-001',
    name: 'Empty query',
    query: '',
    shouldFind: false,
    shouldError: true,
    category: 'edge-case'
  },
  {
    id: 'EDGE-002',
    name: 'Whitespace only',
    query: '   ',
    shouldFind: false,
    shouldError: true,
    category: 'edge-case'
  },
  {
    id: 'EDGE-003',
    name: 'Random numbers only',
    query: '2004',
    shouldFind: true, // Should still attempt search, may find something
    category: 'edge-case'
  },
  {
    id: 'EDGE-004',
    name: 'Province bias with numbers',
    query: '2004',
    province: 'Phnom Penh',
    shouldFind: true,
    category: 'edge-case'
  },

  // ----- CHAIN BUSINESS TESTS -----
  {
    id: 'CHAIN-001',
    name: 'Generic Lucky brand',
    query: 'Lucky',
    shouldFind: true,
    shouldBeAmbiguous: true,
    category: 'chain'
  },
  {
    id: 'CHAIN-002',
    name: 'Specific Lucky branch',
    query: 'Lucky Supermarket Sovanna',
    shouldFind: true,
    shouldBeAmbiguous: false,
    category: 'chain'
  },

  // ----- USER REGRESSION TESTS (from real-world address testing) -----
  {
    id: 'USER-001',
    name: 'ជិតផ្សារអូរឬស្សី ភ្នំពេញ - Orussey Market',
    query: 'ជិតផ្សារអូរឬស្សី ភ្នំពេញ',
    shouldFind: true,
    category: 'user-regression'
  },
  {
    id: 'USER-002',
    name: 'ក្រោយវត្តស្ទឹងមានជ័យ - Pagoda in Meanchey',
    query: 'ក្រោយវត្តស្ទឹងមានជ័យ',
    shouldFind: true,
    category: 'user-regression'
  },
  {
    id: 'USER-003',
    name: 'ក្បែរផ្សារសែនសុខ - Sen Sok Market',
    query: 'ក្បែរផ្សារសែនសុខ',
    shouldFind: true,
    category: 'user-regression'
  },
  {
    id: 'USER-004',
    name: 'ទល់មុខមន្ទីរពេទ្យកាល់ម៉ែត្រ - Calmette Hospital',
    query: 'ទល់មុខមន្ទីរពេទ្យកាល់ម៉ែត្រ',
    shouldFind: true,
    category: 'user-regression'
  },
  {
    id: 'USER-005',
    name: 'បុរីប៉េងហorg បឹងស្នោ - Borey Peng Huoth',
    query: 'បុរីប៉េងorg បឹងស្នោ',
    shouldFind: true,
    category: 'user-regression'
  },
  {
    id: 'USER-006',
    name: 'ជិតស្ពានជ្រោយចង្វារ - Chroy Changvar Bridge',
    query: 'ជិតស្ពានជ្រោយចង្វារ',
    shouldFind: true,
    category: 'user-regression'
  },
  {
    id: 'USER-007',
    name: 'វត្តព្រែកថ្លឹង សង្កាត់ព្រែកកំពិស - Pagoda with Sangkat',
    query: 'វត្តព្រែកថ្លឹង សង្កាត់ព្រែកកំពិស',
    shouldFind: true,
    category: 'user-regression'
  },
  {
    id: 'USER-008',
    name: 'ជិតផ្សារព្រៃទា ពោធិ៍សorg នជ័យ - Prey Tea Market in Pur SenChey',
    query: 'ជorg រព្រorg ា org org org org org org',
    shouldFind: true,
    category: 'user-regression'
  },
  {
    id: 'USER-009',
    name: 'ផ្org org org org org org org org org org - Dei Thmey Veng Sreng',
    query: 'ផorg org វorg org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org',
    shouldFind: true,
    category: 'user-regression'
  },
  {
    id: 'USER-010',
    name: 'ក្org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org - Techo Santipheap Hospital',
    query: 'ក្org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org',
    shouldFind: true,
    category: 'user-regression'
  },
  {
    id: 'USER-011',
    name: 'បorg org org org org org org org org org org org org org org org - Borey Phnom Penh Park Chroy Changvar',
    query: 'org org org org org org org org org org org org org org org org org org org org org org org org org org',
    shouldFind: true,
    category: 'user-regression'
  },
  {
    id: 'USER-012',
    name: 'ក org org org org org org org org org org org org org org org org org org org org org org org - Wat Phnom',
    query: 'ក org org org org org org org org org org org org org org org org org org org org org org org org org',
    shouldFind: true,
    category: 'user-regression'
  },
  {
    id: 'USER-013',
    name: 'ទorg org org org org org org org org org org org org org org org org org org org org org org org org org org org - PP International Airport',
    query: 'org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org',
    shouldFind: true,
    category: 'user-regression'
  },
  {
    id: 'USER-014',
    name: 'ក org org org org org org org org org org org org org org org org org org org org - Chbar Ampov Market',
    query: 'org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org',
    shouldFind: true,
    category: 'user-regression'
  },
  {
    id: 'USER-015',
    name: 'ក org org org org org org org org org org org org org org org org org - Prek Pnov Bridge',
    query: 'org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org org',
    shouldFind: true,
    category: 'user-regression'
  }
];

// ============================================================
// TEST EXECUTION
// ============================================================

async function runEntityExtractionTests() {
  console.log('\n🧪 ENTITY EXTRACTION TESTS\n');
  console.log('='.repeat(60));
  
  const entityTests = regressionTests.filter(t => t.category === 'entity-extraction');
  
  for (const test of entityTests) {
    process.stdout.write(`\n[${test.id}] ${test.name}: `);
    
    try {
      // Test entity extraction locally
      const { extractEntities, getPrimaryEntity } = require('./lib/entity_extractor.js');
      const entities = extractEntities(test.query);
      
      if (test.expectedEntityCount) {
        // Multiple entities expected
        if (entities.length >= test.expectedEntityCount) {
          console.log('✅ PASS');
          passed++;
        } else {
          console.log(`❌ FAIL - Expected ${test.expectedEntityCount} entities, got ${entities.length}`);
          failed++;
          failures.push({ id: test.id, reason: `Expected ${test.expectedEntityCount} entities, got ${entities.length}`, query: test.query });
        }
      } else {
        // Single entity expected
        const primary = getPrimaryEntity(entities);
        if (primary && primary.value.includes(test.expectedEntity)) {
          console.log('✅ PASS');
          passed++;
        } else {
          console.log(`❌ FAIL - Expected "${test.expectedEntity}", got "${primary?.value || 'none'}"`);
          failed++;
          failures.push({ id: test.id, reason: `Expected "${test.expectedEntity}", got "${primary?.value || 'none'}"`, query: test.query });
        }
      }
    } catch (err) {
      console.log(`❌ ERROR: ${err.message}`);
      failed++;
      failures.push({ id: test.id, reason: err.message, query: test.query });
    }
  }
}

async function runAddressResolutionTests() {
  console.log('\n\n📍 ADDRESS RESOLUTION TESTS\n');
  console.log('='.repeat(60));
  
  const addressTests = regressionTests.filter(t => 
    t.category === 'address-resolution' || 
    t.category === 'sentence' ||
    t.category === 'regression' ||
    t.category === 'fuzzy' ||
    t.category === 'google-maps' ||
    t.category === 'edge-case' ||
    t.category === 'chain'
  );
  
  for (const test of addressTests) {
    process.stdout.write(`\n[${test.id}] ${test.name}: `);
    
    try {
      const params = new URLSearchParams({ q: test.query });
      if (test.province) params.append('province', test.province);
      
      const res = await fetch(`${API}/api/smart-find?${params}`);
      
      if (test.shouldError && !res.ok) {
        console.log('✅ PASS (expected error)');
        passed++;
        continue;
      }
      
      if (!res.ok) {
        if (test.shouldFind === false) {
          console.log('✅ PASS (expected not found)');
          passed++;
        } else {
          const errText = await res.text();
          console.log(`❌ FAIL - HTTP ${res.status}`);
          failed++;
          failures.push({ id: test.id, reason: `HTTP ${res.status}: ${errText}`, query: test.query });
        }
        continue;
      }
      
      const data = await res.json();
      
      // Check if location was found
      const found = data.found_coords || data.resolved_market;
      
      if (test.shouldFind === false && !found) {
        console.log('✅ PASS (expected not found)');
        passed++;
        continue;
      }
      
      if (test.shouldFind !== false && !found) {
        console.log('❌ FAIL - No location found');
        failed++;
        failures.push({ id: test.id, reason: 'No location found', query: test.query });
        continue;
      }
      
      // Check expected province
      if (test.expectedProvince && data.resolved_market?.province_kh !== test.expectedProvince) {
        console.log(`❌ FAIL - Wrong province: expected "${test.expectedProvince}", got "${data.resolved_market?.province_kh}"`);
        failed++;
        failures.push({ id: test.id, reason: `Wrong province`, query: test.query });
        continue;
      }
      
      // Check expected market
      if (test.expectedMarket && !normalizeText(data.resolved_market?.market_kh || '').includes(normalizeText(test.expectedMarket))) {
        console.log(`❌ FAIL - Wrong market`);
        failed++;
        failures.push({ id: test.id, reason: `Wrong market`, query: test.query });
        continue;
      }
      
      // Check ambiguity
      if (test.shouldBeAmbiguous && !data.is_ambiguous) {
        console.log('❌ FAIL - Expected ambiguous result');
        failed++;
        failures.push({ id: test.id, reason: 'Expected ambiguous result', query: test.query });
        continue;
      }
      
      console.log('✅ PASS');
      passed++;
      
    } catch (err) {
      console.log(`❌ ERROR: ${err.message}`);
      failed++;
      failures.push({ id: test.id, reason: err.message, query: test.query });
    }
  }
}

function normalizeText(text) {
  if (!text) return '';
  return text.normalize('NFC').toLowerCase().trim();
}

function printSummary() {
  console.log('\n\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`\n✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Total:  ${passed + failed}`);
  console.log(`📊 Pass Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  
  if (failures.length > 0) {
    console.log('\n\n❌ FAILURES:');
    console.log('-'.repeat(60));
    failures.forEach(f => {
      console.log(`\n[${f.id}] Query: "${f.query}"`);
      console.log(`  Reason: ${f.reason}`);
    });
  }
  
  console.log('\n' + '='.repeat(60));
  
  // Exit with error code if any tests failed
  process.exit(failed > 0 ? 1 : 0);
}

async function main() {
  console.log('🧪 SMART-FIND REGRESSION TEST SUITE');
  console.log('='.repeat(60));
  console.log(`Testing against: ${API}`);
  console.log(`Total test cases: ${regressionTests.length}`);
  
  // Run entity extraction tests first (local, no server needed)
  await runEntityExtractionTests();
  
  // Then run address resolution tests (requires server)
  await runAddressResolutionTests();
  
  // Print summary
  printSummary();
}

// Wait 1 second before starting to ensure server is ready
setTimeout(main, 1000);
