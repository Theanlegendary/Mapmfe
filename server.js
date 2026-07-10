const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const Fuse    = require('fuse.js');
const fetch   = require('node-fetch'); // Import node-fetch for API/Geocoding proxying

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──
app.use(cors());
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});
app.use(express.json());
// Serve the root data directory to guarantee frontend/backend synchronization
app.use('/data', express.static(path.join(__dirname, 'data')));
app.use(express.static(path.join(__dirname, 'public')));

// ── Load data once at startup ──
const DATA_PATH = path.join(__dirname, 'data', 'routes.json');
const PICKUP_DATA_PATH = path.join(__dirname, 'data', 'pickup_branches.json');
const FAMOUS_MARKETS_PATH = path.join(__dirname, 'data', 'famous_markets.json');
const CACHE_PATH = path.join(__dirname, 'data', 'geocoding_cache.json');

let routes = [];
let pickupBranches = [];
let famousMarkets = [];
let geocodingCache = {};
let fuse;
let branchFuse;
const translationDict = {};
const khmerToEnglishDict = {};

// Initialize Gemini API client
let ai = null;
try {
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && apiKey.trim()) {
    const { GoogleGenAI } = require('@google/genai');
    ai = new GoogleGenAI({ apiKey: apiKey.trim() });
    console.log('✅ Gemini API client initialized successfully with key');
  } else {
    console.warn('⚠️  GEMINI_API_KEY environment variable not set. Gemini API geocoding fallback is disabled.');
  }
} catch (err) {
  console.warn('⚠️  Failed to initialize Gemini API client:', err.message);
  ai = null;
}


const KHMER_TO_ENGLISH_MANUAL = {
  'ព្រៃស': 'prey sar',
  'ចោមចៅ': 'chom chao',
  'ទឹកថ្លា': 'tuek thla',
  'ស្ទឹងមានជ័យ': 'steung meanchey',
  'បឹងកេងកង': 'boeng keng kang',
  'ទួលគោក': 'tuol kouk',
  'ដូនពេញ': 'daun penh',
  'ប្រាំពីរមករា': 'prampir meakkara',
  'សែនសុខ': 'sen sok',
  'ដង្កោ': 'dangkao',
  'មានជ័យ': 'meanchey',
  'ជ្រោយចង្វារ': 'chroy changvar',
  'ព្រែកព្នៅ': 'prek pnov',
  'ច្បារអំពៅ': 'chbar ampov',
  'កំបូល': 'kamboul',
  'កោះដាច់': 'koh dach',
  'ភ្នំពេញថ្មី': 'phnom penh thmei'
};


try {
  routes = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  console.log(`✅ Loaded ${routes.length} route records`);
} catch (err) {
  console.error('❌ Failed to load routes.json:', err.message);
}

try {
  if (fs.existsSync(PICKUP_DATA_PATH)) {
    pickupBranches = JSON.parse(fs.readFileSync(PICKUP_DATA_PATH, 'utf-8'));
    console.log(`✅ Loaded ${pickupBranches.length} pickup branch records`);
  } else {
    console.warn('⚠️  pickup_branches.json not found, operating with empty list');
  }
} catch (err) {
  console.error('❌ Failed to load pickup_branches.json:', err.message);
  pickupBranches = [];
}

try {
  if (fs.existsSync(FAMOUS_MARKETS_PATH)) {
    famousMarkets = JSON.parse(fs.readFileSync(FAMOUS_MARKETS_PATH, 'utf-8'));
    console.log(`✅ Loaded ${famousMarkets.length} famous market records`);
    
    // Assign nearest branch to each famous market dynamically
    if (famousMarkets.length > 0 && pickupBranches.length > 0) {
      famousMarkets.forEach(m => {
        let minDistance = Infinity;
        let closestBranch = null;
        pickupBranches.forEach(b => {
          if (b.latitude && b.longitude) {
            const d = haversine(m.latitude, m.longitude, b.latitude, b.longitude);
            if (d < minDistance) {
              minDistance = d;
              closestBranch = b;
            }
          }
        });
        if (closestBranch) {
          m.branch_id = closestBranch.store_code;
          // Auto-fill missing province/district using nearest branch as a proxy (e.g. Overpass-imported entries)
          if (!m.province_kh) m.province_kh = closestBranch.province_kh || '';
          if (!m.district_kh) m.district_kh = closestBranch.district_kh || '';
          if (!m.district) m.district = closestBranch.district_en || '';
        } else {
          m.branch_id = "PNP01";
        }
      });
      routes = [...routes, ...famousMarkets];
      console.log(`✅ Merged famous markets into routes. Total records: ${routes.length}`);
    }
  }
} catch (err) {
  console.error('❌ Failed to load famous_markets.json:', err.message);
}

initializeFuse();

try {
  if (fs.existsSync(CACHE_PATH)) {
    geocodingCache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    console.log(`✅ Loaded geocoding cache with ${Object.keys(geocodingCache).length} entries`);
  } else {
    fs.writeFileSync(CACHE_PATH, '{}', 'utf-8');
    geocodingCache = {};
    console.log(`✅ Initialized new empty geocoding cache file`);
  }
} catch (err) {
  console.error('❌ Failed to load geocoding_cache.json:', err.message);
  geocodingCache = {};
}

// ──────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────

function preprocessSpelling(q) {
  if (!q) return '';
  let cleaned = q.trim();
  // Replace variations of Phsar (market)
  cleaned = cleaned.replace(/\b(pshar|psar|phsa|psha|psa)\b/gi, 'phsar');
  // Handle concatenated forms like psharnat -> phsar nat, psarnat -> phsar nat, ensuring we don't match 'phsa' in 'phsar'
  cleaned = cleaned.replace(/\b(pshar|psar|phsa(?!r)|psha|psa)(?=[a-z])/gi, 'phsar ');
  return cleaned;
}

function initializeFuse() {
  fuse = new Fuse(routes, {
    keys: [
      { name: 'market',       weight: 0.50 },
      { name: 'market_kh',    weight: 0.50 },
      { name: 'aliases',      weight: 0.40 },
      { name: 'search_keywords', weight: 0.30 },
      { name: 'district',     weight: 0.20 },  // boosted — important for admin area search
      { name: 'district_kh',  weight: 0.20 },
      { name: 'commune',      weight: 0.15 },
      { name: 'commune_kh',   weight: 0.15 },
      { name: 'village',      weight: 0.12 },
      { name: 'village_kh',   weight: 0.12 },
      { name: 'province',     weight: 0.05 },
      { name: 'province_kh',  weight: 0.05 }
    ],
    threshold: 0.42,            // less strict: 0.5 was too tight for Khmer transliterations
    includeScore: true,
    minMatchCharLength: 2
  });

  branchFuse = new Fuse(pickupBranches, {
    keys: [
      { name: 'store_code',          weight: 0.30 },
      { name: 'store_name',          weight: 0.40 },
      { name: 'district_en',         weight: 0.15 },
      { name: 'district_kh',         weight: 0.15 },
      { name: 'province_kh',         weight: 0.10 },
      { name: 'raw_delivery_store',  weight: 0.20 }
    ],
    threshold: 0.42,
    includeScore: true,
    minMatchCharLength: 2
  });

  buildTranslationDict();
}

function buildTranslationDict() {
  const add = (en, kh, isMarket = false) => {
    const cen = stripAdministrativePrefixes(normalizeKhmer(en));
    const ckh = stripAdministrativePrefixes(normalizeKhmer(kh));
    if (cen && ckh && !translationDict[cen]) {
      translationDict[cen] = ckh;
    }
    // Only add to reverse dictionary if it's not a generic market name to prevent false suffix matches (e.g. forest)
    if (cen && ckh && !isMarket && !khmerToEnglishDict[ckh]) {
      khmerToEnglishDict[ckh] = cen;
    }
  };

  // Populate manual translations first so they take precedence
  for (const [kh, en] of Object.entries(KHMER_TO_ENGLISH_MANUAL)) {
    const normKh = normalizeKhmer(kh);
    const normEn = stripAdministrativePrefixes(normalizeKhmer(en));
    if (normKh && normEn) {
      khmerToEnglishDict[normKh] = normEn;
      translationDict[normEn] = normKh;
    }
  }

  // Populate from routes
  routes.forEach(r => {
    add(r.province, r.province_kh);
    add(r.district, r.district_kh);
    add(r.commune, r.commune_kh);
    add(r.village, r.village_kh);
    add(r.market, r.market_kh, true);
  });

  // Populate from pickup branches
  pickupBranches.forEach(b => {
    add(b.district_en, b.district_kh);
  });
}

function stripKhmerPrefix(kh) {
  if (!kh) return '';
  return kh.replace(/^(ខណ្ឌ|សង្កាត់|ស្រុក|ក្រុង|រាជធានី|ខេត្ត|ភូមិ|ឃុំ|ផ្សារ)/g, '').trim();
}

function stripAdministrativePrefixes(str) {
  if (!str) return '';
  let s = str.normalize("NFC").toLowerCase().trim();
  // Strip Khmer prefixes
  s = s.replace(/^(ភូមិ|ឃុំ|សង្កាត់|ស្រុក|ខណ្ឌ|ខេត្ត|ក្រុង|រាជធានី|ផ្សារ)/g, '').trim();
  // Strip English prefixes or suffixes
  s = s.replace(/\b(khan|srok|krong|sangkat|commune|village|phsar|psar|market|district|province|capital)\b/gi, '').trim();
  return s;
}

function getKhmerStoreName(storeName) {
  if (!storeName) return '';
  const cleanEn = storeName.trim().replace(/\b(Khan|Srok|Krong|Sangkat|Sangkat\/Commune|Commune|Village|Phsar|Psar|Market|District|Province|Capital)\b/gi, '').trim().toLowerCase();
  const rawKh = translationDict[cleanEn];
  if (rawKh) {
    return stripKhmerPrefix(rawKh);
  }
  return '';
}

function translateKhmerToEnglish(query) {
  const normQ = stripAdministrativePrefixes(normalizeKhmer(query));
  if (!normQ) return '';

  if (khmerToEnglishDict[normQ]) {
    return khmerToEnglishDict[normQ];
  }

  let translated = normQ;
  const keys = Object.keys(khmerToEnglishDict).sort((a, b) => b.length - a.length);
  let replaced = false;
  
  for (const k of keys) {
    if (translated.includes(k)) {
      const en = khmerToEnglishDict[k];
      translated = translated.replace(new RegExp(k, 'g'), ' ' + en + ' ');
      replaced = true;
    }
  }

  if (replaced) {
    return translated.replace(/\s+/g, ' ').trim();
  }
  return '';
}


function resolveMarketLocal(q, province = '') {
  if (!fuse) return null;
  let searchResults = fuse.search(q);
  if (province) {
    const normProv = normalizeKhmer(province);
    searchResults = searchResults.filter(res => 
      (res.item.province && normalizeKhmer(res.item.province).includes(normProv)) ||
      (res.item.province_kh && normalizeKhmer(res.item.province_kh).includes(normProv))
    );
  }

  if (searchResults && searchResults.length > 0) {
    return {
      match: searchResults[0].item,
      source: 'local_db_fuzzy'
    };
  }
  
  // fallback exact match
  const normQ = normalizeKhmer(q);
  let exactList = routes;
  if (province) {
    const normProv = normalizeKhmer(province);
    exactList = exactList.filter(r =>
      (r.province && normalizeKhmer(r.province).includes(normProv)) ||
      (r.province_kh && normalizeKhmer(r.province_kh).includes(normProv))
    );
  }
  const exact = exactList.find(r => {
    const mEn = normalizeKhmer(r.market);
    const mKh = normalizeKhmer(r.market_kh);
    if (mEn.includes(normQ) || mKh.includes(normQ)) return true;

    const strippedQ = stripAdministrativePrefixes(normQ);
    if (strippedQ && strippedQ.length >= 2) {
      return stripAdministrativePrefixes(mEn).includes(strippedQ) || 
             stripAdministrativePrefixes(mKh).includes(strippedQ);
    }
    return false;
  });
  if (exact) {
    return {
      match: exact,
      source: 'local_db_exact'
    };
  }
  return null;
}


function matchesPickupBranchQuery(branch, q) {
  const normQ = normalizeKhmer(q);
  if (!normQ) return false;

  const fields = [
    branch.store_code,
    branch.store_name,
    getKhmerStoreName(branch.store_name),
    branch.province_kh,
    branch.district_en,
    branch.district_kh,
    branch.raw_delivery_store
  ];

  const matched = fields.some(field => {
    if (!field) return false;
    return normalizeKhmer(field).includes(normQ);
  });
  if (matched) return true;

  const strippedQ = stripAdministrativePrefixes(normQ);
  if (strippedQ && strippedQ.length >= 2) {
    return fields.some(field => {
      if (!field) return false;
      const strippedField = stripAdministrativePrefixes(normalizeKhmer(field));
      return strippedField.includes(strippedQ);
    });
  }

  return false;
}

/** Haversine distance in km between two lat/lng pairs */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const PROVINCE_MAP = {
  'phnom penh': 'ភ្នំពេញ',
  'phnom penh capital': 'ភ្នំពេញ',
  'siem reap': 'សៀមរាប',
  'siemreap': 'សៀមរាប',
  'battambang': 'បាត់ដំបង',
  'kampong cham': 'កំពង់ចាម',
  'kampong chhnang': 'កំពង់ឆ្នាំង',
  'kampong speu': 'កំពង់ស្ពឺ',
  'kampong thom': 'កំពង់ធំ',
  'kampot': 'កំពត',
  'kandal': 'កណ្តាល',
  'kep': 'កែប',
  'koh kong': 'កោះកុង',
  'kratie': 'ក្រចេះ',
  'mondul kiri': 'មណ្ឌលគីរី',
  'mondulkiri': 'មណ្ឌលគីរី',
  'oddar meanchey': 'ឧត្តរមានជ័យ',
  'otdar meanchey': 'ឧត្តរមានជ័យ',
  'pailin': 'ប៉ៃលិន',
  'preah sihanouk': 'ព្រះសីហនុ',
  'preah vihear': 'ព្រះវិហារ',
  'prey veng': 'ព្រៃវែង',
  'pursat': 'ពោធិ៍សាត់',
  'ratanak kiri': 'រតនគីរី',
  'ratanakkiri': 'រតនគីរី',
  'stung treng': 'ស្ទឹងត្រែង',
  'svay rieng': 'ស្វាយរៀង',
  'takeo': 'តាកែវ',
  'tboung khmum': 'ត្បូងឃ្មុំ',
  'tboungkhmum': 'ត្បូងឃ្មុំ',
  'banteay meanchey': 'បន្ទាយមានជ័យ'
};

function getKhmerProvince(prov) {
  if (!prov) return '';
  const norm = prov.toLowerCase().trim();
  return PROVINCE_MAP[norm] || prov;
}

function getEnglishProvince(khmerProv) {
  if (!khmerProv) return '';
  for (const [en, kh] of Object.entries(PROVINCE_MAP)) {
    if (kh === khmerProv) {
      return en.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
  }
  return khmerProv;
}

// Second pass: fill in missing English province names for famous markets/routes
// (e.g. Overpass-imported entries only have province_kh at load time, before
// PROVINCE_MAP was available)
routes.forEach(r => {
  if (!r.province && r.province_kh) {
    r.province = getEnglishProvince(r.province_kh) || '';
  }
});

/** Find the nearest pickup branch to a coordinate */
function findNearestPickupBranch(lat, lng, maxDist = Infinity, province = '') {
  if (pickupBranches.length === 0) return null;

  let list = pickupBranches;
  if (province) {
    const normProv = normalizeKhmer(getKhmerProvince(province));
    list = list.filter(b => 
      (b.province_kh && normalizeKhmer(b.province_kh).includes(normProv))
    );
  }

  const scored = list
    .map(b => ({ ...b, distance_km: haversine(lat, lng, b.latitude, b.longitude) }))
    .filter(b => b.distance_km <= maxDist)
    .sort((a, b) => a.distance_km - b.distance_km);

  return scored[0] || null;
}

/** Find the nearest market in routes.json to a coordinate */
function findNearestRouteMarket(lat, lng, maxDist = 3.0, province = '') {
  if (routes.length === 0) return null;

  let list = routes;
  if (province) {
    const normProv = normalizeKhmer(province);
    list = list.filter(r => 
      (r.province && normalizeKhmer(r.province).includes(normProv)) ||
      (r.province_kh && normalizeKhmer(r.province_kh).includes(normProv))
    );
  }

  const scored = list
    .map(r => ({ ...r, distance_km: haversine(lat, lng, r.latitude, r.longitude) }))
    .filter(r => r.distance_km <= maxDist)
    .sort((a, b) => a.distance_km - b.distance_km);

  return scored[0] || null;
}



/** Check if a route matches a free-text query (Unicode normalized and case-insensitive) */
function normalizeKhmer(str) {
  if (!str) return "";
  let normalized = str.normalize("NFC").toLowerCase().trim();
  normalized = normalized.replace(/\u178E\u17D2\u178F/g, "\u178E\u17D2\u178A"); // ណ + ្ត -> ណ + ្ដ
  normalized = normalized.replace(/\u17C1\u17B8/g, "\u17BE"); // decomposed vowel OE (េី -> ើ)
  normalized = normalized.replace(/\u17C1\u17B6/g, "\u17C4"); // decomposed vowel OO (េា -> ោ)
  normalized = normalized.replace(/\u200B/g, "");             // zero-width space
  return normalized;
}

function matchesQuery(route, q) {
  const normQ = normalizeKhmer(q);
  if (!normQ) return false;

  const fields = [
    route.branch_id,
    route.province,
    route.province_kh,
    route.district,
    route.district_kh,
    route.commune,
    route.commune_kh,
    route.village,
    route.village_kh,
    route.market,
    route.market_kh
  ];

  // Direct substring match in any field
  if (fields.some(field => {
    if (!field) return false;
    return normalizeKhmer(field).includes(normQ);
  })) {
    return true;
  }

  // Strip admin prefixes from both query and field values, then match
  const strippedQ = stripAdministrativePrefixes(normQ);
  if (strippedQ && strippedQ.length >= 2) {
    if (fields.some(field => {
      if (!field) return false;
      const strippedField = stripAdministrativePrefixes(normalizeKhmer(field));
      return strippedField.includes(strippedQ);
    })) {
      return true;
    }
  }

  // Check aliases and search keywords arrays
  if (route.aliases && Array.isArray(route.aliases)) {
    if (route.aliases.some(a => a && normalizeKhmer(a).includes(normQ))) {
      return true;
    }
  }
  if (route.search_keywords && Array.isArray(route.search_keywords)) {
    if (route.search_keywords.some(k => k && normalizeKhmer(k).includes(normQ))) {
      return true;
    }
  }

  return false;
}



// ──────────────────────────────────────────────────────────────────
// ROUTES
// ──────────────────────────────────────────────────────────────────

/**
 * GET /api/search
 */
app.get('/api/search', (req, res) => {
  const { q = '', branch_id, province, district, limit = 20, page = 1, type } = req.query;

  const processedQ = preprocessSpelling(q);
  let results = [];
  const isMarket = (type === 'market');

  if (isMarket) {
    let dataset = routes;
    
    // Apply province filter first!
    if (province) {
      const normProv = normalizeKhmer(province);
      dataset = dataset.filter(r =>
        normalizeKhmer(r.province).includes(normProv) ||
        normalizeKhmer(r.province_kh).includes(normProv)
      );
    }
    // Apply district filter!
    if (district) {
      const normDist = normalizeKhmer(district);
      dataset = dataset.filter(r =>
        normalizeKhmer(r.district).includes(normDist) ||
        normalizeKhmer(r.district_kh).includes(normDist)
      );
    }
    // Apply branch_id filter!
    if (branch_id) {
      const normBranch = normalizeKhmer(branch_id);
      dataset = dataset.filter(r => normalizeKhmer(r.branch_id) === normBranch);
    }

    // Now search within the filtered dataset!
    if (processedQ) {
      // Substring/Prefix matches first (high priority)
      const exactMatches = dataset.filter(r => matchesQuery(r, processedQ));
      
      // Fuzzy matches as fallback
      let fuzzyMatches = [];
      if (exactMatches.length < 15) {
        const tempFuse = new Fuse(dataset, {
          keys: [
            { name: 'market', weight: 0.5 },
            { name: 'market_kh', weight: 0.5 }
          ],
          threshold: 0.5
        });
        fuzzyMatches = tempFuse.search(processedQ).map(res => res.item);
      }
      
      // Combine and remove duplicates
      const combined = [...exactMatches, ...fuzzyMatches];
      results = Array.from(new Set(combined));

      // Check if this is Phsar Thmey query and prioritize central market
      const isPhsarThmeyQuery = /p[h]?s[h]?ar.*t[h]?me[yi]/i.test(processedQ) || 
                               /p[h]?s[h]?ar.*t[h]?o[m]?.*t[h]?me[yi]/i.test(processedQ) || 
                               /central.*market/i.test(processedQ) || 
                               processedQ.includes('ផ្សារថ្មី') || 
                               processedQ.includes('ផ្សារ ថ្មី') || 
                               processedQ.includes('ផ្សារធំថ្មី') || 
                               processedQ.includes('ផ្សារ ធំ ថ្មី');
      if (isPhsarThmeyQuery) {
        const centralMarketRoute = routes.find(r => r.id === 43);
        if (centralMarketRoute) {
          results = results.filter(r => r.id !== 43);
          results.unshift(centralMarketRoute);
        }
      }
    } else {
      results = dataset;
    }

  } else {
    // Search in pickup branches (Post Offices)
    let dataset = pickupBranches;

    // Apply province filter first!
    if (province) {
      const normProv = normalizeKhmer(getKhmerProvince(province));
      dataset = dataset.filter(b =>
        normalizeKhmer(b.province_kh).includes(normProv)
      );
    }
    // Apply district filter!
    if (district) {
      const normDist = normalizeKhmer(district);
      dataset = dataset.filter(b =>
        normalizeKhmer(b.district_en).includes(normDist) ||
        normalizeKhmer(b.district_kh).includes(normDist)
      );
    }
    // Apply branch_id filter!
    if (branch_id) {
      const normBranch = normalizeKhmer(branch_id);
      dataset = dataset.filter(b =>
        normalizeKhmer(b.store_code) === normBranch ||
        normalizeKhmer(b.raw_delivery_store).includes(normBranch)
      );
    }

    // Now search within the filtered dataset!
    if (processedQ) {
      // Substring matches first (highly reliable)
      const exactMatches = dataset.filter(b => matchesPickupBranchQuery(b, processedQ));
      
      // Fuzzy matches as fallback
      let fuzzyMatches = [];
      if (exactMatches.length < 15) {
        const tempFuse = new Fuse(dataset, {
          keys: [
            { name: 'store_code', weight: 0.3 },
            { name: 'store_name', weight: 0.4 },
            { name: 'raw_delivery_store', weight: 0.3 }
          ],
          threshold: 0.5
        });
        fuzzyMatches = tempFuse.search(processedQ).map(res => res.item);
      }
      
      const combined = [...exactMatches, ...fuzzyMatches];
      results = Array.from(new Set(combined));
    } else {
      results = dataset;
    }

    // Format pickup branch records to match frontend expectations
    results = results.map(r => ({
      id: `po_${r.store_code}`,
      branch_id: r.store_code,
      market: r.store_name,
      market_kh: getKhmerStoreName(r.store_name),
      province: getEnglishProvince(r.province_kh),
      province_kh: r.province_kh,
      district: r.district_en,
      district_kh: r.district_kh,
      commune: '',
      commune_kh: '',
      village: '',
      village_kh: '',
      latitude: r.latitude,
      longitude: r.longitude,
      google_maps_url: `https://www.google.com/maps?q=${r.latitude},${r.longitude}`
    }));
  }


  // Pagination
  const total      = results.length;
  const pageNum    = Math.max(1, parseInt(page));
  const limitNum   = Math.min(100, Math.max(1, parseInt(limit)));
  const offset     = (pageNum - 1) * limitNum;
  const paginated  = results.slice(offset, offset + limitNum);

  res.json({
    total,
    page: pageNum,
    limit: limitNum,
    pages: Math.ceil(total / limitNum),
    results: paginated
  });
});


/**
 * GET /api/branch/:id
 */
app.get('/api/branch/:id', (req, res) => {
  const id = req.params.id.toLowerCase();
  const results = routes.filter(r => r.branch_id.toLowerCase() === id);
  if (results.length === 0) {
    return res.status(404).json({ error: `No routes found for branch "${req.params.id}"` });
  }
  res.json({ branch_id: req.params.id.toUpperCase(), count: results.length, routes: results });
});

/**
 * GET /api/nearby
 */
app.get('/api/nearby', (req, res) => {
  const { lat, lng, radius = 10, limit = 20, type, province } = req.query;
  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat and lng are required' });
  }
  const latF  = parseFloat(lat);
  const lngF  = parseFloat(lng);
  const radF  = parseFloat(radius);
  const limN  = Math.min(100, parseInt(limit));

  const isMarket = (type === 'market');
  let results = isMarket 
    ? routes.filter(r => r.latitude && r.longitude)
    : pickupBranches.filter(b => b.latitude && b.longitude);

  if (province) {
    const normProv = normalizeKhmer(province);
    results = results.filter(r => {
      const p = isMarket ? r.province : r.province_kh;
      const pKh = isMarket ? r.province_kh : r.province_kh;
      return (p && normalizeKhmer(p).includes(normProv)) || (pKh && normalizeKhmer(pKh).includes(normProv));
    });
  }


  results = results
    .map(r => {
      if (isMarket) {
        return {
          ...r,
          distance_km: Math.round(haversine(latF, lngF, r.latitude, r.longitude) * 100) / 100
        };
      } else {
        return {
          id: `po_${r.store_code}`,
          branch_id: r.store_code,
          market: r.store_name,
          market_kh: getKhmerStoreName(r.store_name),
          province: getEnglishProvince(r.province_kh),
          province_kh: r.province_kh,
          district: r.district_en,
          district_kh: r.district_kh,
          commune: '',
          commune_kh: '',
          village: '',
          village_kh: '',
          latitude: r.latitude,
          longitude: r.longitude,
          google_maps_url: `https://www.google.com/maps?q=${r.latitude},${r.longitude}`,
          distance_km: Math.round(haversine(latF, lngF, r.latitude, r.longitude) * 100) / 100
        };
      }
    })
    .filter(r => r.distance_km <= radF)
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, limN);

  res.json({ lat: latF, lng: lngF, radius_km: radF, count: results.length, results });
});


/**
 * GET /api/branches
 */
app.get('/api/branches', (req, res) => {
  const counts = {};
  routes.forEach(r => {
    if (!counts[r.branch_id]) counts[r.branch_id] = 0;
    counts[r.branch_id]++;
  });
  const list = Object.entries(counts)
    .map(([branch_id, count]) => ({ branch_id, count }))
    .sort((a, b) => a.branch_id.localeCompare(b.branch_id));
  res.json({ total: list.length, branches: list });
});

/**
 * GET /api/filters
 */
app.get('/api/filters', (req, res) => {
  const provinces = [...new Set(routes.map(r => r.province).filter(Boolean))].sort();
  const branches = [...new Set(pickupBranches.map(b => b.store_code).filter(Boolean))].sort();
  res.json({
    provinces,
    branches: branches.map(b => ({ branch_id: b, name_en: b }))
  });
});

/**
 * GET /api/stats
 */
app.get('/api/stats', (req, res) => {
  const provinces = [...new Set(routes.map(r => r.province))].filter(Boolean);
  const districts = [...new Set(routes.map(r => r.district))].filter(Boolean);
  const branchSet = [...new Set(routes.map(r => r.branch_id))].filter(Boolean);
  res.json({
    total_routes: routes.length,
    total_branches: branchSet.length,
    total_provinces: provinces.length,
    total_districts: districts.length,
    provinces: provinces.sort()
  });
});

// ──────────────────────────────────────────────────────────────────
// FREE GOOGLE MAPS PROXY ENDPOINTS (NO KEY REQUIRED!)
// ──────────────────────────────────────────────────────────────────

/**
 * GET /api/google-autocomplete
 * Proxy Google's public search autocomplete engine
 */
app.get('/api/google-autocomplete', async (req, res) => {
  const { q, province } = req.query;
  if (!q || !q.trim()) return res.json([]);

  const query = q.trim();
  const searchString = province ? `${query}, ${province}` : query;

  try {
    const url = `https://clients1.google.com/complete/search?client=chrome&hl=km&gl=kh&q=${encodeURIComponent(searchString)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Encoding': 'identity'
      }
    });
    const data = await response.json();
    
    // Google suggestions format: [query, [sugg1, sugg2, ...]]
    const suggestions = data[1] || [];
    res.json(suggestions);
  } catch (err) {
    console.error('Google Autocomplete Proxy Error:', err.message);
    res.json([]);
  }
});

function isWithinCambodia(lat, lng) {
  if (!lat || !lng) return false;
  return lat >= 9.5 && lat <= 15.0 && lng >= 102.0 && lng <= 108.0;
}

function inferProvinceAndDistrict(lat, lng) {
  if (!lat || !lng) return { province: 'Google Location', province_kh: '', district: '', district_kh: '' };
  
  let minDistance = Infinity;
  let closestRecord = null;
  let isBranch = false;

  for (const r of (routes || [])) {
    if (r.latitude && r.longitude) {
      const d = haversine(lat, lng, r.latitude, r.longitude);
      if (d < minDistance) {
        minDistance = d;
        closestRecord = r;
        isBranch = false;
      }
    }
  }

  for (const b of (pickupBranches || [])) {
    if (b.latitude && b.longitude) {
      const d = haversine(lat, lng, b.latitude, b.longitude);
      if (d < minDistance) {
        minDistance = d;
        closestRecord = b;
        isBranch = true;
      }
    }
  }

  if (closestRecord) {
    if (isBranch) {
      return {
        province: getEnglishProvince(closestRecord.province_kh) || closestRecord.province_kh,
        province_kh: closestRecord.province_kh,
        district: closestRecord.district_en || '',
        district_kh: closestRecord.district_kh || ''
      };
    } else {
      return {
        province: closestRecord.province || '',
        province_kh: closestRecord.province_kh || '',
        district: closestRecord.district || '',
        district_kh: closestRecord.district_kh || ''
      };
    }
  }

  return { province: 'Google Location', province_kh: '', district: '', district_kh: '' };
}

/**
 * GET /api/google-geocode
 * Free geocoding by crawling Google Maps search page and parsing coordinates
 */
function findBestResult(results, query) {
  if (results.length === 0) return null;
  const normQ = normalizeKhmer(preprocessSpelling(query));
  
  let best = null;
  let bestScore = -1;

  for (const r of results) {
    const rName = normalizeKhmer(r.market || r.name || r.display_name || '');
    const rNameKh = normalizeKhmer(r.market_kh || '');
    
    let score = 0;
    if (rName === normQ || rNameKh === normQ) {
      score = 100;
    } else if (rName.startsWith(normQ) || rNameKh.startsWith(normQ)) {
      score = 50;
    } else if (rName.includes(normQ) || rNameKh.includes(normQ)) {
      score = 20;
    }
    
    const nameLen = rName.length;
    if (score > 0) {
      score -= (nameLen - normQ.length) * 0.1;
    }
    
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  
  return best || results[0];
}

app.get('/api/google-geocode', async (req, res) => {
  const { q, province } = req.query;
  if (!q || !q.trim()) return res.status(400).json({ error: 'Query parameter q is required' });

  const query = q.trim();
  const coords = await resolveCoordsWithSpellingCorrection(query, province);
  
  if (coords) {
    if (coords.type === 'multiple') {
      const filteredResults = (coords.results || []).filter(r => isWithinCambodia(r.latitude, r.longitude));
      if (filteredResults.length > 0) {
        const enrichedResults = filteredResults.map(r => {
          const inf = inferProvinceAndDistrict(r.latitude, r.longitude);
          return {
            ...r,
            province: inf.province || r.province,
            province_kh: inf.province_kh || r.province_kh,
            district: inf.district || r.district,
            district_kh: inf.district_kh || r.district_kh
          };
        });

        let finalResults = enrichedResults;
        if (province) {
          const allowedProvinces = [province];
          const khProv = getKhmerProvince(province);
          if (khProv) allowedProvinces.push(khProv);
          const enProv = getEnglishProvince(province);
          if (enProv) allowedProvinces.push(enProv);
          const normAllowed = allowedProvinces.map(p => normalizeKhmer(p));

          finalResults = enrichedResults.filter(r => {
            return normAllowed.some(normP => 
              (r.province && normalizeKhmer(r.province).includes(normP)) ||
              (r.province_kh && normalizeKhmer(r.province_kh).includes(normP))
            );
          });
        }

        if (finalResults.length > 0) {
          // If all matches belong to the same province, avoid showing Multiple Selection screen.
          // Direct route to the single best candidate.
          let allInSameProvince = true;
          if (finalResults.length > 1) {
            const firstProv = normalizeKhmer(finalResults[0].province || finalResults[0].province_kh);
            if (firstProv) {
              allInSameProvince = finalResults.every(r => {
                const prov = normalizeKhmer(r.province || r.province_kh);
                return prov === firstProv || prov.includes(firstProv) || firstProv.includes(prov);
              });
            } else {
              allInSameProvince = false;
            }
          }

          if (allInSameProvince) {
            const best = findBestResult(finalResults, query);
            return res.json({
              lat: best.latitude || best.lat,
              lng: best.longitude || best.lon || best.lng,
              name: best.market || best.name || query,
              province: best.province,
              province_kh: best.province_kh,
              district: best.district,
              district_kh: best.district_kh
            });
          }

          if (finalResults.length === 1) {
            return res.json({
              lat: finalResults[0].latitude,
              lng: finalResults[0].longitude,
              name: finalResults[0].market,
              province: finalResults[0].province,
              province_kh: finalResults[0].province_kh,
              district: finalResults[0].district,
              district_kh: finalResults[0].district_kh
            });
          }
          return res.json({
            type: 'multiple',
            results: finalResults
          });
        }
      }
    } else if (isWithinCambodia(coords.lat, coords.lng)) {
      const inf = inferProvinceAndDistrict(coords.lat, coords.lng);
      let matchProv = true;
      if (province) {
        const allowedProvinces = [province];
        const khProv = getKhmerProvince(province);
        if (khProv) allowedProvinces.push(khProv);
        const enProv = getEnglishProvince(province);
        if (enProv) allowedProvinces.push(enProv);
        const normAllowed = allowedProvinces.map(p => normalizeKhmer(p));

        matchProv = normAllowed.some(normP => 
          (inf.province && normalizeKhmer(inf.province).includes(normP)) ||
          (inf.province_kh && normalizeKhmer(inf.province_kh).includes(normP))
        );
      }

      if (matchProv) {
        return res.json({
          ...coords,
          province: inf.province,
          province_kh: inf.province_kh,
          district: inf.district,
          district_kh: inf.district_kh
        });
      }
    }
  }
  
  res.status(404).json({ error: 'Coordinates not found' });
});

// Extracts the human-readable place name embedded in a Google Maps URL, if present.
// Handles patterns like:
//   /maps/place/Phsar+Chas/@11.56,104.92,17z/...
//   /maps/place/ផ្សារចាស់/@...
function extractPlaceNameFromUrl(urlStr) {
  try {
    const placeMatch = urlStr.match(/\/maps\/place\/([^\/@]+)/i);
    if (placeMatch && placeMatch[1]) {
      let name = decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')).trim();
      // Strip trailing coordinate-looking fragments or Place ID hashes just in case
      name = name.replace(/^data=.*/i, '').trim();
      if (name && !/^[-+]?\d+\.\d+,[-+]?\d+\.\d+$/.test(name)) {
        return name;
      }
    }
  } catch (e) {
    // ignore malformed URL fragments
  }
  return null;
}

async function parseGoogleMapsLink(urlStr) {
  let targetUrl = urlStr.trim();
  try {
    targetUrl = decodeURIComponent(targetUrl);
  } catch (e) {
    // ignore decoding errors if URL is already partially decoded/invalid
  }
  
  if (/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(targetUrl)) {
    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9,km;q=0.8'
        },
        redirect: 'follow'
      });
      targetUrl = response.url;
    } catch (err) {
      console.error('Error resolving short Google Maps URL:', err.message);
    }
  }

  // Try to extract the real place name embedded in the URL path (works for both short and long links once resolved)
  const extractedName = extractPlaceNameFromUrl(targetUrl);

  // 1. Try to find !3d...!4d... parameters (more precise place pin location, choosing the last occurrence if multiple exist)
  const matches3d4d = [...targetUrl.matchAll(/!3d([-+]?\d+\.\d+)!4d([-+]?\d+\.\d+)/g)];
  if (matches3d4d.length > 0) {
    const lastMatch = matches3d4d[matches3d4d.length - 1];
    return {
      lat: parseFloat(lastMatch[1]),
      lng: parseFloat(lastMatch[2]),
      name: extractedName || 'Google Maps Link Pin'
    };
  }

  // 2. Try to find @lat,lng
  const atCoords = targetUrl.match(/@([-+]?\d+\.\d+),([-+]?\d+\.\d+)/);
  if (atCoords) {
    return {
      lat: parseFloat(atCoords[1]),
      lng: parseFloat(atCoords[2]),
      name: extractedName || 'Google Maps Viewport'
    };
  }

  // 3. Try to find q=lat,lng or query=lat,lng or ll=lat,lng
  const qCoords = targetUrl.match(/[?&](q|query|ll)=([-+]?\d+\.\d+),([-+]?\d+\.\d+)/i);
  if (qCoords) {
    return {
      lat: parseFloat(qCoords[2]),
      lng: parseFloat(qCoords[3]),
      name: extractedName || 'Google Maps Query Location'
    };
  }

  // 4. Look for general latitude, longitude pattern in URL path/query
  const generalCoords = targetUrl.match(/([-+]?\d+\.\d+)\s*,\s*([-+]?\d+\.\d+)/);
  if (generalCoords) {
    return {
      lat: parseFloat(generalCoords[1]),
      lng: parseFloat(generalCoords[2]),
      name: extractedName || 'Google Maps URL Coordinates'
    };
  }

  // 5. Fallback: try crawling page content for static map or location center if url has coordinates embedded but we couldn't parse it
  try {
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (res.ok) {
      const html = await res.text();

      // Try to pull the place name out of the page <title> as a last-resort name source
      let titleName = null;
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        titleName = titleMatch[1].replace(/\s*-\s*Google Maps\s*$/i, '').trim();
        if (!titleName || /^google maps$/i.test(titleName)) titleName = null;
      }

      const staticMapMatch = html.match(/center=([-+]?\d+\.\d+)(?:%2C|,)([-+]?\d+\.\d+)/i);
      if (staticMapMatch) {
        return {
          lat: parseFloat(staticMapMatch[1]),
          lng: parseFloat(staticMapMatch[2]),
          name: extractedName || titleName || 'Google Maps Embedded Coordinates'
        };
      }
      const initMatch = html.match(/\[\[\s*([-+]?\d+\.\d+)\s*,\s*([-+]?\d+\.\d+)\s*\]/);
      if (initMatch) {
        return {
          lat: parseFloat(initMatch[1]),
          lng: parseFloat(initMatch[2]),
          name: extractedName || titleName || 'Google Maps Page Coordinates'
        };
      }
    }
  } catch (err) {
    console.error('Failed to parse Google Maps page HTML:', err.message);
  }

  return null;
}

function saveToGeocodingCache(query, lat, lng, displayName = '') {
  if (!query || lat == null || lng == null) return;
  const normQ = normalizeKhmer(query.trim());
  
  // Save by normalized query name
  geocodingCache[normQ] = {
    lat: parseFloat(lat),
    lng: parseFloat(lng),
    display_name: displayName || query
  };

  // Also save by coordinates string
  const coordKey = `${parseFloat(lat).toFixed(6)},${parseFloat(lng).toFixed(6)}`;
  geocodingCache[coordKey] = {
    display_name: displayName || query
  };

  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(geocodingCache, null, 2), 'utf-8');
    console.log(`💾 Saved "${query}" to geocoding cache`);
  } catch (err) {
    console.error('Failed to write to geocoding_cache.json:', err.message);
  }
}

async function geocodeWithGemini(query, province = '') {
  if (!ai) return null;
  
  const prompt = `You are an expert GIS and mapping assistant specialized in Cambodia geography.
Given a user query (which may be in Khmer, English, or a mix) and an optional province name, resolve the location to its geographic coordinates (latitude and longitude) and administrative areas.
User Query: "${query}"
Province Hint: "${province}"

CRITICAL RULES:
1. Only return coordinates if you are 100% sure of the exact location (e.g. major markets, temples, landmarks, cities, or provinces).
2. For street names or numbered streets (e.g. "street 2004", "street 209", "st 371", "st 271") or specific road numbers, if you do not know the exact coordinates of that street, you MUST return null coordinates. Do not guess or hallucinate coordinates.
3. If you cannot find the location or are unsure of the coordinates, return null coordinates.

You must return a JSON object with this schema:
{
  "lat": number or null,
  "lng": number or null,
  "name": "resolved english name",
  "name_kh": "resolved khmer name",
  "province": "english province",
  "province_kh": "khmer province",
  "district": "english district",
  "district_kh": "khmer district",
  "commune": "english commune",
  "commune_kh": "khmer commune",
  "village": "english village",
  "village_kh": "khmer village"
}
Only return valid JSON conforming to the schema.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const resultText = response.text;
    if (!resultText) return null;

    const data = JSON.parse(resultText);
    if (data && data.lat && data.lng) {
      return {
        lat: parseFloat(data.lat),
        lng: parseFloat(data.lng),
        name: data.name || query,
        province: data.province || '',
        province_kh: data.province_kh || '',
        district: data.district || '',
        district_kh: data.district_kh || '',
        commune: data.commune || '',
        commune_kh: data.commune_kh || '',
        village: data.village || '',
        village_kh: data.village_kh || ''
      };
    }
  } catch (err) {
    console.error(`Gemini geocoding API error for "${query}":`, err.message);
  }
  return null;
}

async function queryGoogleGeocode(query, province = '') {
  const key = process.env.GOOGLE_GEOCODING_API_KEY;
  if (!key || !key.trim()) return null;

  try {
    const searchQuery = province ? `${query}, ${province}, Cambodia` : `${query}, Cambodia`;
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(searchQuery)}&components=country:KH&key=${key.trim()}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`Google Geocoding API failed: HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();

    if (data.status === 'OVER_QUERY_LIMIT' || data.status === 'REQUEST_DENIED') {
      console.warn(`Google Geocoding API status: ${data.status} — ${data.error_message || ''}`);
      return null;
    }

    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      return null;
    }

    if (data.results.length === 1) {
      const r = data.results[0];
      return {
        lat: r.geometry.location.lat,
        lng: r.geometry.location.lng,
        name: r.formatted_address.replace(', Cambodia', '').trim()
      };
    } else {
      return {
        type: 'multiple',
        results: data.results.map((r, idx) => {
          const lat = r.geometry.location.lat;
          const lng = r.geometry.location.lng;
          const inf = inferProvinceAndDistrict(lat, lng);
          return {
            id: 'google_' + idx + '_' + Date.now(),
            market: r.address_components[0]?.long_name || r.formatted_address,
            market_kh: '',
            latitude: lat,
            longitude: lng,
            province: inf.province || '',
            province_kh: inf.province_kh || '',
            district: inf.district || '',
            district_kh: inf.district_kh || '',
            commune: '',
            commune_kh: '',
            village: '',
            village_kh: '',
            display_name: r.formatted_address,
            google_maps_url: `https://www.google.com/maps?q=${lat},${lng}`
          };
        })
      };
    }
  } catch (err) {
    console.error('Failed to query Google geocode:', err.message);
    return null;
  }
}

async function queryMapboxGeocode(query, province = '') {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token || !token.trim()) return null;

  try {
    const searchQuery = province ? `${query}, ${province}, Cambodia` : `${query}, Cambodia`;
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json?access_token=${token.trim()}&country=KH&limit=5`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`Mapbox Geocoding API failed: HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    if (!data.features || data.features.length === 0) return null;

    if (data.features.length === 1) {
      const feat = data.features[0];
      return {
        lat: feat.center[1],
        lng: feat.center[0],
        name: feat.place_name.replace(', Cambodia', '').trim()
      };
    } else {
      return {
        type: 'multiple',
        results: data.features.map((feat, idx) => {
          const lat = feat.center[1];
          const lng = feat.center[0];
          const inf = inferProvinceAndDistrict(lat, lng);
          return {
            id: 'mapbox_' + idx + '_' + Date.now(),
            market: feat.text,
            market_kh: '',
            latitude: lat,
            longitude: lng,
            province: inf.province || '',
            province_kh: inf.province_kh || '',
            district: inf.district || '',
            district_kh: inf.district_kh || '',
            commune: '',
            commune_kh: '',
            village: '',
            village_kh: '',
            display_name: feat.place_name,
            google_maps_url: `https://www.google.com/maps?q=${lat},${lng}`
          };
        })
      };
    }
  } catch (err) {
    console.error('Failed to query Mapbox geocode:', err.message);
    return null;
  }
}

async function resolveCoordsWithSpellingCorrection(query, province = '') {
  // 0. Support Google Maps Link parsing (e.g. https://maps.app.goo.gl/xxx or https://www.google.com/maps/...)
  if (/maps\.app\.goo\.gl|goo\.gl\/maps|google\.com\/maps/i.test(query)) {
    const parsedCoords = await parseGoogleMapsLink(query);
    if (parsedCoords && isWithinCambodia(parsedCoords.lat, parsedCoords.lng)) {
      return parsedCoords;
    }
    return null; // Do not fall back to text matching for a URL query
  }

  // 0.5 Support direct GPS coordinates parsing (e.g. "11.556, 104.928")
  const gpsRegex = /^\s*([-+]?\d+\.\d+)\s*[\s,]\s*([-+]?\d+\.\d+)\s*$/;
  const gpsMatch = query.match(gpsRegex);
  if (gpsMatch) {
    const lat = parseFloat(gpsMatch[1]);
    const lng = parseFloat(gpsMatch[2]);
    if (isWithinCambodia(lat, lng)) {
      return {
        lat,
        lng,
        name: `Coordinates: ${lat.toFixed(5)}, ${lng.toFixed(5)}`
      };
    }
  }

  // Check geocoding cache FIRST
  const processedQuery = preprocessSpelling(query);
  const normQ = normalizeKhmer(processedQuery);
  const normQuery = processedQuery.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (geocodingCache[normQ]) {
    const cached = geocodingCache[normQ];
    console.log(`🎯 Geocoding Cache Hit for: "${query}" -> (${cached.lat}, ${cached.lng})`);
    return {
      lat: cached.lat,
      lng: cached.lng,
      name: cached.display_name
    };
  }

  // Try searching in famousMarkets database first!
  const matchedFamous = famousMarkets.filter(m => {
    // 1. Khmer/Normalized Substring matching (Very precise)
    const normMarket = normalizeKhmer(m.market);
    const normMarketKh = normalizeKhmer(m.market_kh);
    
    let matchesMarket = false;
    
    if (normQ) {
      if (normMarket.includes(normQ) || normMarketKh.includes(normQ)) {
        matchesMarket = true;
      }
      if (!matchesMarket && (m.aliases || []).some(a => normalizeKhmer(a).includes(normQ))) {
        matchesMarket = true;
      }
      if (!matchesMarket && (m.search_keywords || []).some(k => normalizeKhmer(k).includes(normQ))) {
        matchesMarket = true;
      }
    }

    // 2. Alphanumeric fallback (Only if normQuery is not empty to avoid matching everything)
    if (!matchesMarket && normQuery) {
      const alphaMarket = m.market.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (alphaMarket.includes(normQuery) || normQuery.includes(alphaMarket)) {
        matchesMarket = true;
      }
      if (!matchesMarket && (m.aliases || []).some(a => {
        const alphaA = a.toLowerCase().replace(/[^a-z0-9]/g, '');
        return alphaA.includes(normQuery) || normQuery.includes(alphaA);
      })) {
        matchesMarket = true;
      }
      if (!matchesMarket && (m.search_keywords || []).some(k => {
        const alphaK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        // To avoid generic keyword matches like 'phsar' matching 'phsar samaki' query,
        // we check if the clean keyword contains normQuery, OR if it's an exact match
        return alphaK.includes(normQuery) || alphaK === normQuery;
      })) {
        matchesMarket = true;
      }
    }
                          
    if (!matchesMarket) return false;
    
    // If a province is specified, we must also match the province!
    if (province) {
      const normProv = normalizeKhmer(province);
      const provMatch = normalizeKhmer(m.province).includes(normProv) || normalizeKhmer(m.province_kh).includes(normProv);
      return provMatch;
    }
    return true;
  });

  if (matchedFamous.length > 0) {
    if (matchedFamous.length === 1) {
      const best = matchedFamous[0];
      console.log(`🎯 Exact match found in local Famous Markets DB: "${best.market}"`);
      return {
        lat: best.latitude,
        lng: best.longitude,
        name: `${best.market} (${best.market_kh || ''})`
      };
    } else {
      console.log(`🎯 Multiple matches found in local Famous Markets DB (${matchedFamous.length} matches)`);
      return {
        type: 'multiple',
        results: matchedFamous.map(best => ({
          id: `famous_${best.id}`,
          market: best.market,
          market_kh: best.market_kh,
          province: best.province,
          province_kh: best.province_kh,
          district: best.district,
          district_kh: best.district_kh,
          latitude: best.latitude,
          longitude: best.longitude,
          lat: best.latitude,
          lon: best.longitude,
          display_name: `${best.market} (${best.market_kh || ''}), ${best.district}, ${best.province}, Cambodia`
        }))
      };
    }
  }
  
  // Static override for Ang Tasom (Angtasom / Angk Ta Saom) in Takeo Province
  const isAngtasom = normQuery.includes('angtasom') || 
                     normQuery.includes('angtarsom') || 
                     normQuery.includes('angtasong') || 
                     (normQuery.includes('ang') && normQuery.includes('tasom')) ||
                     normQuery.includes('angktaasom') || 
                     normQuery.includes('angkktasaom') ||
                     processedQuery.includes('អង្គតាសោម');
  if (isAngtasom) {
    return {
      lat: 11.0131,
      lng: 104.6732,
      name: "Angk Ta Saom (អង្គតាសោម)"
    };
  }

  const isPP = normQuery.includes('phnompenh') || normQuery.includes('pp') || province.toLowerCase().includes('phnom penh');

  if (isPP) {
    const isPhsarThmey = /p[h]?s[h]?ar.*t[h]?me[yi]/i.test(normQuery) || 
                         normQuery.includes('centralmarket') || 
                         processedQuery.includes('ផ្សារធំថ្មី') || 
                         processedQuery.includes('ផ្សារថ្មី') || 
                         processedQuery.includes('ផ្សារ ថ្មី') || 
                         processedQuery.includes('ផ្សារ ធំ ថ្មី');
    if (isPhsarThmey) {
      return {
        lat: 11.5696,
        lng: 104.9211,
        name: "Central Market (ផ្សារធំថ្មី)"
      };
    }
    const isDaeumKor = /p[h]?s[h]?ar.*d[a-z]+m.*ko/i.test(normQuery) || 
                       processedQuery.includes('ផ្សារដើមគរ') || 
                       processedQuery.includes('ផ្សារ ដើមគរ') || 
                       processedQuery.includes('ផ្សារ ដើម គរ');
    if (isDaeumKor) {
      return {
        lat: 11.5538,
        lng: 104.9025,
        name: "Phsar Daeum Kor (ផ្សារដើមគរ)"
      };
    }
  }

  // 1. Try translating Khmer to English using our dictionary
  let translatedQuery = '';
  const hasKhmer = /[\u1780-\u17FF]/.test(processedQuery);
  if (hasKhmer) {
    translatedQuery = translateKhmerToEnglish(processedQuery);
    if (translatedQuery) {
      console.log(`♻️ Translated Khmer query to English: "${processedQuery}" -> "${translatedQuery}"`);
    }
  }

  // Build the search query string, restricting strictly to Cambodia
  const searchQuery = province ? `${processedQuery}, ${province}, Cambodia` : `${processedQuery}, Cambodia`;
  const enSearchQuery = (translatedQuery && province) 
    ? `${translatedQuery}, ${province}, Cambodia` 
    : (translatedQuery ? `${translatedQuery}, Cambodia` : '');

  // 0.8 Try Google Geocoding first (if API key is available) — most accurate, matches Google Maps app results
  const googleResult = await queryGoogleGeocode(enSearchQuery || searchQuery, province);
  if (googleResult) {
    console.log(`🎯 Geocoded successfully via Google: "${enSearchQuery || searchQuery}"`);
    if (googleResult.type !== 'multiple') {
      saveToGeocodingCache(query, googleResult.lat, googleResult.lng, googleResult.name);
    }
    return googleResult;
  }

  // 0.9 Try Mapbox Geocoding next (if token is available)
  const mapboxResult = await queryMapboxGeocode(enSearchQuery || searchQuery);
  if (mapboxResult) {
    console.log(`🎯 Geocoded successfully via Mapbox: "${enSearchQuery || searchQuery}"`);
    if (mapboxResult.type !== 'multiple') {
      saveToGeocodingCache(query, mapboxResult.lat, mapboxResult.lng, mapboxResult.name);
    }
    return mapboxResult;
  }

  // 1. Try to geocode the query directly using Nominatim/Photon first (free, fast, and no rate limits)
  const qToNom = enSearchQuery || searchQuery;
  let nomResults = await queryNominatim(qToNom, 5);
  
  if (!nomResults || nomResults.length === 0) {
    const strippedQuery = stripAdministrativePrefixes(processedQuery);
    if (strippedQuery && strippedQuery !== processedQuery) {
      const strippedSearchQuery = province ? `${strippedQuery}, ${province}, Cambodia` : `${strippedQuery}, Cambodia`;
      console.log(`🔍 Direct geocode failed. Retrying with stripped prefixes: "${strippedSearchQuery}"`);
      nomResults = await queryNominatim(strippedSearchQuery, 5);
    }
  }

  if (nomResults && nomResults.length > 0) {
    // Sort results: prioritize Phnom Penh matches first if no specific province is selected!
    if (!province) {
      nomResults.sort((a, b) => {
        const aPP = (a.display_name || '').toLowerCase().includes('phnom penh');
        const bPP = (b.display_name || '').toLowerCase().includes('phnom penh');
        if (aPP && !bPP) return -1;
        if (!aPP && bPP) return 1;
        return 0;
      });
    }

    if (nomResults.length === 1) {
      const r = nomResults[0];
      const lat = parseFloat(r.lat);
      const lng = parseFloat(r.lon);
      // Enrich with local inferred province/district fields
      const inf = inferProvinceAndDistrict(lat, lng);
      const addr = r.address || {};
      const resVal = {
        lat, lng,
        name: r.name || r.display_name.split(',')[0] || query,
        province:    inf.province    || addr.state || addr.county || '',
        province_kh: inf.province_kh || '',
        district:    inf.district    || addr.city  || addr.town  || addr.village || '',
        district_kh: inf.district_kh || '',
        commune:     addr.suburb     || addr.neighbourhood || '',
        commune_kh:  '',
        village:     '',
        village_kh:  ''
      };
      saveToGeocodingCache(query, lat, lng, resVal.name);
      return resVal;
    } else {
      return {
        type: 'multiple',
        results: nomResults.map((r, idx) => {
          const lat = parseFloat(r.lat);
          const lng = parseFloat(r.lon);
          const addr = r.address || {};
          const inf = inferProvinceAndDistrict(lat, lng);
          // Extract the most specific name from Nominatim's address hierarchy
          const locName = r.name
            || addr.hamlet || addr.village || addr.suburb
            || addr.neighbourhood || addr.town || addr.city
            || r.display_name.split(',')[0];
          const commune = addr.suburb || addr.neighbourhood || addr.hamlet || '';
          const district = inf.district || addr.city || addr.town || addr.village || addr.county || '';
          const province = inf.province || addr.state || addr.county || '';
          return {
            id: 'target_' + idx + '_' + Date.now(),
            market:      locName,
            market_kh:   '',
            latitude:    lat,
            longitude:   lng,
            province:    province,
            province_kh: inf.province_kh || '',
            district:    district,
            district_kh: inf.district_kh || '',
            commune:     commune,
            commune_kh:  '',
            village:     '',
            village_kh:  '',
            display_name: r.display_name,
            google_maps_url: `https://www.google.com/maps?q=${lat},${lng}`
          };
        })
      };
    }
  }

  // 2. Try Google Maps HTML crawler geocoding next as fallback (gives the exact Google Maps coordinates & coverage)
  try {
    const qToCrawl = enSearchQuery || searchQuery;
    const googleCoords = await crawlGoogleMapsCoords(qToCrawl);
    if (googleCoords && isWithinCambodia(googleCoords.lat, googleCoords.lng)) {
      console.log(`🎯 Geocoded successfully via Google Maps Crawler: "${qToCrawl}" -> (${googleCoords.lat}, ${googleCoords.lng})`);
      saveToGeocodingCache(query, googleCoords.lat, googleCoords.lng, googleCoords.name);
      return googleCoords;
    }
  } catch (err) {
    console.error('Google Maps Crawler direct geocode failed:', err.message);
  }

  // 2. If it fails, query Google Autocomplete suggestions to get the corrected spelling
  try {
    const autoQuery = province ? `${processedQuery}, ${province}` : processedQuery;
    const autocompleteUrl = `https://clients1.google.com/complete/search?client=chrome&hl=km&gl=kh&q=${encodeURIComponent(autoQuery)}`;
    const autoRes = await fetch(autocompleteUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept-Encoding': 'identity'
      }
    });
    const autoData = await autoRes.json();
    const suggestions = autoData[1] || [];
    
    // Try to geocode the first 6 suggestions
    for (const sugg of suggestions.slice(0, 6)) {
      if (sugg.toLowerCase() !== autoQuery.toLowerCase()) {
        const suggCoords = await queryNominatim(sugg, 1);
        if (suggCoords && suggCoords.length > 0) {
          const lat = parseFloat(suggCoords[0].lat);
          const lng = parseFloat(suggCoords[0].lon);
          console.log(`✨ Corrected spelling "${autoQuery}" -> "${sugg}" and geocoded successfully!`);
          saveToGeocodingCache(query, lat, lng, sugg);
          saveToGeocodingCache(sugg, lat, lng, sugg);
          return {
            lat,
            lng,
            name: sugg
          };
        }
      }
    }
  } catch (err) {
    console.error('Spelling correction autocomplete failed:', err.message);
  }

  // 3. Fallback: Try Gemini API geocoding
  try {
    const geminiCoords = await geocodeWithGemini(query, province);
    if (geminiCoords && isWithinCambodia(geminiCoords.lat, geminiCoords.lng)) {
      console.log(`🎯 Geocoded successfully via Gemini API: "${query}" -> (${geminiCoords.lat}, ${geminiCoords.lng})`);
      saveToGeocodingCache(query, geminiCoords.lat, geminiCoords.lng, geminiCoords.name);
      return geminiCoords;
    }
  } catch (err) {
    console.error('Gemini API geocoding fallback failed:', err.message);
  }

  // 4. Fallback: return null since all methods failed
  return null;
}

async function queryPhoton(query, limit = 1) {
  let searchQueries = [query];
  const hasKhmer = /[\u1780-\u17FF]/.test(query);
  if (hasKhmer) {
    let romanized = query;
    // Map common Khmer administrative/geographic prefixes to standard English Romanizations
    romanized = romanized.replace(/វត្ត/g, 'Wat ');
    romanized = romanized.replace(/ផ្សារ/g, 'Phsar ');
    romanized = romanized.replace(/សង្កាត់/g, 'Sangkat ');
    romanized = romanized.replace(/ខណ្ឌ/g, 'Khan ');
    romanized = romanized.replace(/ស្រុក/g, 'Srok ');
    romanized = romanized.replace(/ឃុំ/g, 'Commune ');
    romanized = romanized.replace(/ភូមិ/g, 'Phum ');
    romanized = romanized.replace(/ព្រែក/g, 'Prek ');
    romanized = romanized.replace(/កំពង់/g, 'Kampong ');
    romanized = romanized.replace(/កោះ/g, 'Koh ');
    romanized = romanized.replace(/ភ្នំ/g, 'Phnom ');
    romanized = romanized.replace(/បឹង/g, 'Boeng ');
    romanized = romanized.replace(/ទន្លេ/g, 'Tonle ');
    romanized = romanized.replace(/ស្ទឹង/g, 'Steung ');

    // Romanize common Khmer place name word endings/stems
    romanized = romanized.replace(/ល្ហួង/g, 'Luong');
    romanized = romanized.replace(/ហ្លួង/g, 'Luong');
    romanized = romanized.replace(/លួង/g, 'Luong');
    romanized = romanized.replace(/លាប/g, 'Leab');
    romanized = romanized.replace(/ចរែង/g, 'Chraeng');
    romanized = romanized.replace(/ខ្ពប/g, 'Khpob');
    romanized = romanized.replace(/វែង/g, 'Veng');
    romanized = romanized.replace(/ធំ/g, 'Thom');
    romanized = romanized.replace(/ថ្មី/g, 'Thmey');
    romanized = romanized.replace(/ចាស់/g, 'Chas');
    romanized = romanized.replace(/ក្រោម/g, 'Krom');
    romanized = romanized.replace(/លើ/g, 'Leu');

    romanized = romanized.replace(/\s+/g, ' ').trim();
    if (romanized !== query) {
      searchQueries.push(romanized);
    }
  }

  for (const q of searchQueries) {
    try {
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=${limit}`;
      const res = await fetch(url, {
        headers: {
          'Accept-Encoding': 'identity',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      if (!res.ok) continue;
      const data = await res.json();
      const features = data.features || [];
      if (features.length === 0) continue;

      const mapped = features
        .filter(f => {
          const coords = f.geometry.coordinates;
          if (!coords || coords.length < 2) return false;
          const lng = coords[0];
          const lat = coords[1];
          // Restrict results to the approximate Cambodia bounding box
          const inCambodia = (lat >= 9.5 && lat <= 15.0 && lng >= 102.0 && lng <= 108.0);
          return f.properties.countrycode === 'KH' || inCambodia;
        })
        .map(f => {
          const props = f.properties;
          const coords = f.geometry.coordinates;
          const displayName = [props.name, props.street, props.district || props.suburb, props.city, props.state, props.country].filter(Boolean).join(', ');
          return {
            lat: coords[1].toString(),
            lon: coords[0].toString(),
            name: props.name || '',
            display_name: displayName
          };
        });

      if (mapped.length > 0) {
        return mapped;
      }
    } catch (err) {
      console.warn(`[queryPhoton] Attempt failed for "${q}":`, err.message);
    }
  }
  return [];
}

async function queryNominatim(query, limit = 1) {
  // 1. Try Photon first (highly reliable, no rate limits, includes our Romanization helper)
  try {
    const photonResults = await queryPhoton(query, limit);
    if (photonResults && photonResults.length > 0) {
      return photonResults;
    }
  } catch (err) {
    console.error(`Photon query failed for "${query}":`, err.message);
  }

  // 2. Safety fallback: OpenStreetMap Nominatim
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&countrycodes=kh&limit=${limit}`;
    const nomRes = await fetch(nomUrl, {
      headers: {
        'User-Agent': 'MetfoneExpressBranchLocator/1.0 (contact@metfone.com.kh)',
        'Accept-Language': 'km,en;q=0.9'
      }
    });
    if (nomRes.ok) {
      const nomData = await nomRes.json();
      return nomData || [];
    }
  } catch (err) {
    console.error(`Nominatim fallback query failed for "${query}":`, err.message);
  }
  return [];
}

async function crawlGoogleMapsCoords(query) {
  try {
    const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9,km;q=0.8',
        'Accept-Encoding': 'identity'
      }
    });

    const finalUrl = response.url;
    const urlMatch = finalUrl.match(/@([-+]?\d+\.\d+),([-+]?\d+\.\d+)/);
    
    // Helper to check if resolved coordinates are just the default Phnom Penh viewport center
    const checkDefaultCoords = (lat, lng) => {
      const isDefaultPP = Math.abs(lat - 11.57422315) < 0.005 && Math.abs(lng - 104.9264128) < 0.005;
      const queryMentionsPP = query.toLowerCase().includes('phnom') || query.toLowerCase().includes('pp') || query.includes('ភ្នំពេញ');
      return isDefaultPP && !queryMentionsPP;
    };

    if (urlMatch) {
      const lat = parseFloat(urlMatch[1]);
      const lng = parseFloat(urlMatch[2]);
      if (checkDefaultCoords(lat, lng)) {
        return null;
      }
      return {
        lat,
        lng,
        name: query
      };
    }

    const html = await response.text();

    const staticMapMatch = html.match(/center=([-+]?\d+\.\d+)(?:%2C|,)([-+]?\d+\.\d+)/i);
    if (staticMapMatch) {
      const lat = parseFloat(staticMapMatch[1]);
      const lng = parseFloat(staticMapMatch[2]);
      if (checkDefaultCoords(lat, lng)) {
        return null;
      }
      return {
        lat,
        lng,
        name: query
      };
    }

    const inlineMatch = html.match(/\/maps\/preview\/place\/[^\/]+\/@([-+]?\d+\.\d+),([-+]?\d+\.\d+)/);
    if (inlineMatch) {
      const lat = parseFloat(inlineMatch[1]);
      const lng = parseFloat(inlineMatch[2]);
      if (checkDefaultCoords(lat, lng)) {
        return null;
      }
      return {
        lat,
        lng,
        name: query
      };
    }
  } catch (err) {
    console.error(`Google maps crawl failed for "${query}":`, err.message);
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────
// SMART FINDER (LEGACY BACKUP)
// ──────────────────────────────────────────────────────────────────

app.get('/api/smart-find', async (req, res) => {
  const { q = '', max_dist, province } = req.query;
  if (!q.trim()) {
    return res.status(400).json({ error: 'Query q is required' });
  }

  let coords = null;
  let source = null;
  let resolvedMarket = null;

  // 1. Try Google Maps Geocoder first to get the most accurate coordinates!
  try {
    const geoCoords = await resolveCoordsWithSpellingCorrection(q.trim(), province);
    if (geoCoords && geoCoords.lat && geoCoords.lng) {
      coords = { lat: geoCoords.lat, lng: geoCoords.lng };
      source = 'google_geocoding';
      
      // Look up if there's a matching market in our routes.json database
      // to extract metadata like district, province, and default assigned branch_id!
      const localResult = resolveMarketLocal(q.trim(), province);
      if (localResult) {
        resolvedMarket = localResult.match;
      } else {
        // If no text match, find the nearest market in routes.json within 3km of Google's coordinates
        const nearestMarket = findNearestRouteMarket(coords.lat, coords.lng, 3.0, province);
        if (nearestMarket) {
          resolvedMarket = nearestMarket;
        } else {
          resolvedMarket = { market: geoCoords.name || q.trim() };
        }
      }
    }
  } catch (err) {
    console.error('Google geocoding failed in smart-find:', err.message);
  }

  // 2. Fallback: Search local database (routes.json) if geocoding fails
  if (!coords) {
    const localResult = resolveMarketLocal(q.trim(), province);
    if (localResult) {
      resolvedMarket = localResult.match;
      coords = { lat: resolvedMarket.latitude, lng: resolvedMarket.longitude };
      source = localResult.source;
    } else {
      // Fallback: Search in pickup_branches (Post Offices) if not found in routes database
      const matchingBranch = pickupBranches.find(b => {
        if (province) {
          const khProv = getKhmerProvince(province);
          const normProv = normalizeKhmer(khProv);
          const bProvKh = normalizeKhmer(b.province_kh);
          if (!bProvKh.includes(normProv)) return false;
        }
        return matchesPickupBranchQuery(b, q.trim());
      });
      if (matchingBranch) {
        resolvedMarket = {
          id: `po_${matchingBranch.store_code}`,
          branch_id: matchingBranch.store_code,
          market: matchingBranch.store_name,
          market_kh: getKhmerStoreName(matchingBranch.store_name),
          province: getEnglishProvince(matchingBranch.province_kh),
          province_kh: matchingBranch.province_kh,
          district: matchingBranch.district_en,
          district_kh: matchingBranch.district_kh,
          latitude: matchingBranch.latitude,
          longitude: matchingBranch.longitude
        };
        coords = { lat: matchingBranch.latitude, lng: matchingBranch.longitude };
        source = 'local_branches_exact';
      }
    }
  }

  // 3. Fallback: Search saved place cache (geocoding_cache.json)
  if (!coords) {
    const normQ = normalizeKhmer(q.trim());
    
    // First try exact key lookup in cache
    if (geocodingCache[normQ]) {
      const entry = geocodingCache[normQ];
      coords = { lat: entry.lat, lng: entry.lng };
      source = 'cache';
      resolvedMarket = { market: entry.display_name };
    } else {
      // Fallback to substring matching in cache values
      const cacheEntry = Object.entries(geocodingCache).find(([key, val]) => 
        val.display_name && normalizeKhmer(val.display_name).includes(normQ)
      );
      if (cacheEntry) {
        const [key, val] = cacheEntry;
        if (val.lat && val.lng) {
          coords = { lat: val.lat, lng: val.lng };
        } else {
          const [lat, lng] = key.split(',').map(Number);
          coords = { lat, lng };
        }
        source = 'cache';
        resolvedMarket = { market: val.display_name };
      }
    }
  }

  if (!coords) {
    return res.status(404).json({ 
      error: 'Location not found in DB, cache, or Geocoding Service.',
      query: q 
    });
  }

  const nearest = findNearestPickupBranch(coords.lat, coords.lng, max_dist ? parseFloat(max_dist) : Infinity, province);

  if (!nearest) {
    return res.status(404).json({ 
      error: 'No pickup branch found within the specified distance.',
      coords,
      source
    });
  }

  let defaultAssignedPO = null;
  if (resolvedMarket && resolvedMarket.branch_id) {
    const branchCode = resolvedMarket.branch_id.toUpperCase();
    const foundBranch = pickupBranches.find(b => b.store_code.toUpperCase() === branchCode);
    if (foundBranch) {
      defaultAssignedPO = {
        id: `po_${foundBranch.store_code}`,
        branch_id: foundBranch.store_code,
        market: foundBranch.store_name,
        province: getEnglishProvince(foundBranch.province_kh),
        district: foundBranch.district_en,
        latitude: foundBranch.latitude,
        longitude: foundBranch.longitude
      };
    }
  }

  res.json({
    query: q,
    resolved_market: resolvedMarket,
    found_coords: coords,
    coords_source: source,
    default_assigned_post_office: defaultAssignedPO,
    nearest_post_office: {
      id: `po_${nearest.store_code}`,
      branch_id: nearest.store_code,
      market: nearest.store_name,
      market_kh: getKhmerStoreName(nearest.store_name),
      province: getEnglishProvince(nearest.province_kh),
      province_kh: nearest.province_kh,
      district: nearest.district_en,
      district_kh: nearest.district_kh,
      commune: '',
      commune_kh: '',
      village: '',
      village_kh: '',
      latitude: nearest.latitude,
      longitude: nearest.longitude,
      google_maps_url: `https://www.google.com/maps?q=${nearest.latitude},${nearest.longitude}`,
      distance_km: parseFloat(nearest.distance_km.toFixed(2))
    },
    pickup_branch: {
      branch_id: nearest.raw_delivery_store,
      store_code: nearest.store_code,
      store_name: nearest.store_name,
      province_kh: nearest.province_kh,
      district_en: nearest.district_en,
      district_kh: nearest.district_kh,
      latitude: nearest.latitude,
      longitude: nearest.longitude
    },
    distance_km: parseFloat(nearest.distance_km.toFixed(2))
  });

});

/**
 * POST /api/learn-location
 * Automatically grows the local database with new locations discovered via
 * geocoding results or user-pasted Google Maps links. Saves to a separate
 * "learned_locations.json" file (kept apart from curated famous_markets.json
 * so you can review/promote entries later if you want).
 */
const LEARNED_LOCATIONS_PATH = path.join(__dirname, 'data', 'learned_locations.json');
let learnedLocations = [];
try {
  if (fs.existsSync(LEARNED_LOCATIONS_PATH)) {
    learnedLocations = JSON.parse(fs.readFileSync(LEARNED_LOCATIONS_PATH, 'utf-8'));
    console.log(`✅ Loaded ${learnedLocations.length} learned location records`);
  }
} catch (err) {
  console.error('❌ Failed to load learned_locations.json:', err.message);
  learnedLocations = [];
}

app.post('/api/learn-location', (req, res) => {
  try {
    const { name, name_kh, latitude, longitude, source, query } = req.body;

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (!name || isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: 'name, latitude, and longitude are required' });
    }
    if (!isWithinCambodia(lat, lng)) {
      return res.status(400).json({ error: 'Coordinates are outside Cambodia, skipped' });
    }

    const normName = normalizeKhmer(name);

    // Dedup check against existing routes, famous markets, and already-learned locations
    const existsNearby = (list) => list.some(item => {
      const itemName = normalizeKhmer(item.market || item.name || '');
      if (!itemName || itemName !== normName) return false;
      const d = haversine(lat, lng, item.latitude, item.longitude);
      return d < 0.5; // within 500m and same name = duplicate
    });

    if (existsNearby(routes) || existsNearby(famousMarkets) || existsNearby(learnedLocations)) {
      return res.json({ success: true, message: 'Location already known, skipped duplicate' });
    }

    const newEntry = {
      id: `learned_${Date.now()}`,
      market: name,
      market_kh: name_kh || '',
      latitude: lat,
      longitude: lng,
      google_maps_url: `https://www.google.com/maps?q=${lat},${lng}`,
      source: source || 'geocode',
      original_query: query || '',
      learned_at: new Date().toISOString()
    };

    learnedLocations.push(newEntry);

    // Cap the file size defensively (keep most recent 5000 entries)
    if (learnedLocations.length > 5000) {
      learnedLocations = learnedLocations.slice(-5000);
    }

    fs.writeFileSync(LEARNED_LOCATIONS_PATH, JSON.stringify(learnedLocations, null, 2), 'utf-8');

    // Merge into in-memory routes so it's searchable immediately without restart
    routes.push({ ...newEntry, province: '', province_kh: '', district: '', district_kh: '' });
    initializeFuse();

    console.log(`📚 Learned new location: "${name}" (${lat}, ${lng}) from ${source || 'geocode'}`);
    res.json({ success: true, message: 'Location learned and added to database', entry: newEntry });
  } catch (err) {
    console.error('Failed to learn new location:', err.message);
    res.status(500).json({ error: 'Failed to save learned location' });
  }
});

/**
 * GET /api/learned-locations
 * View all auto-learned locations (for review)
 */
app.get('/api/learned-locations', (req, res) => {
  res.json({ total: learnedLocations.length, locations: learnedLocations });
});

/**
 * POST /api/update-market-coords
 * Update market coordinates and persist to routes.json
 */
app.post('/api/update-market-coords', (req, res) => {
  const { id, latitude, longitude } = req.body;
  if (id == null || latitude == null || longitude == null) {
    return res.status(400).json({ error: 'Parameters id, latitude, and longitude are required' });
  }

  // Find the index of the route in our in-memory list
  const idx = routes.findIndex(r => String(r.id) === String(id));
  if (idx === -1) {
    return res.status(404).json({ error: 'Market not found in database' });
  }

  // Update in memory
  routes[idx].latitude = parseFloat(latitude);
  routes[idx].longitude = parseFloat(longitude);
  routes[idx].google_maps_url = `https://www.google.com/maps?q=${latitude},${longitude}`;

  // Persist to appropriate database file
  try {
    const isFamous = (parseFloat(id) >= 9000);
    if (isFamous) {
      const fmIdx = famousMarkets.findIndex(m => String(m.id) === String(id));
      if (fmIdx !== -1) {
        famousMarkets[fmIdx].latitude = parseFloat(latitude);
        famousMarkets[fmIdx].longitude = parseFloat(longitude);
        famousMarkets[fmIdx].google_maps_url = `https://www.google.com/maps?q=${latitude},${longitude}`;
      }
      fs.writeFileSync(FAMOUS_MARKETS_PATH, JSON.stringify(famousMarkets, null, 2), 'utf-8');
      console.log(`💾 Persisted market correction for Famous Market ID ${id} to famous_markets.json`);
    } else {
      // Exclude famous markets from routes.json to prevent duplicate propagation
      const originalRoutesOnly = routes.filter(r => parseFloat(r.id) < 9000);
      fs.writeFileSync(DATA_PATH, JSON.stringify(originalRoutesOnly, null, 2), 'utf-8');
      console.log(`💾 Persisted market correction for Route ID ${id} to routes.json`);
    }
    
    // Re-initialize search index
    initializeFuse();
    
    res.json({ success: true, message: 'Market coordinates updated successfully', updated: routes[idx] });
  } catch (err) {
    console.error('Failed to write database updates:', err.message);
    res.status(500).json({ error: 'Failed to persist updates to database files' });
  }
});

// GET /api/clear-cache - Clear the persistent geocoding cache on the server
app.get('/api/clear-cache', (req, res) => {
  try {
    geocodingCache = {};
    fs.writeFileSync(CACHE_PATH, '{}', 'utf-8');
    console.log('🧹 Geocoding cache cleared successfully via API request');
    res.send(`
      <div style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1 style="color: #10b981;">✅ Geocoding Cache Cleared!</h1>
        <p style="color: #4b5563; font-size: 16px;">The persistent search cache has been successfully wiped clean.</p>
        <p style="color: #6b7280; font-size: 14px;">Next searches will now fetch fresh, correct coordinates from geocoding services.</p>
        <br/>
        <a href="/" style="background: #3b82f6; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px;">Back to Map</a>
      </div>
    `);
  } catch (err) {
    console.error('Failed to clear geocoding cache:', err.message);
    res.status(500).send(`Failed to clear cache: ${err.message}`);
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Branch Search Server running at http://0.0.0.0:${PORT}`);
});
