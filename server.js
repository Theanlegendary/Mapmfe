const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const Fuse    = require('fuse.js');
const fetch   = require('node-fetch'); // Import node-fetch for API/Geocoding proxying
const fuzz    = require('fuzzball');

// Auto-Pick Engine & 12km Spatial Branch Indexer
const autoPick = require('./lib/auto_pick_engine');
const spatialIndexer = require('./lib/spatial_branch_indexer');

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

// Serve training slides directly from project root
app.get('/train.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'train.html'));
});

app.get('/training-slides.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'train.html'));
});

app.get(['/pastemaster', '/pastemaster.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pastemaster.html'));
});

app.get(['/pastemaster-training', '/pastemaster_training.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pastemaster_training.html'));
});

app.get(['/branch-assigner', '/branch_assigner.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'branch_assigner.html'));
});

// ── Load data once at startup ──
const DATA_PATH = path.join(__dirname, 'data', 'routes.json');
const PICKUP_DATA_PATH = path.join(__dirname, 'data', 'pickup_branches.json');
const FAMOUS_MARKETS_PATH = path.join(__dirname, 'data', 'famous_markets.json');
const CURATED_LANDMARKS_PATH = path.join(__dirname, 'data', 'curated_landmarks.json');
const CACHE_PATH = path.join(__dirname, 'data', 'geocoding_cache.json');
const NCDD_PATH = path.join(__dirname, 'data', 'ncdd_hierarchy.json');

let routes = [];
let pickupBranches = [];
let famousMarkets = [];
let curatedLandmarks = [];
let geocodingCache = {};
let ncddHierarchy = [];
let flatNcddList = [];
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
    
    if (fs.existsSync(CURATED_LANDMARKS_PATH)) {
      curatedLandmarks = JSON.parse(fs.readFileSync(CURATED_LANDMARKS_PATH, 'utf-8'));
      famousMarkets = [...famousMarkets, ...curatedLandmarks];
      console.log(`Loaded ${curatedLandmarks.length} curated landmark records`);
    }

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

// Initialize NCDD flat search list
function initializeNcddFlatList() {
  flatNcddList = [];
  ncddHierarchy.forEach(p => {
    flatNcddList.push({
      type: 'province',
      code: p.code,
      name_en: p.name_en,
      name_kh: p.name_kh,
      path_en: p.name_en,
      path_kh: p.name_kh,
      province_en: p.name_en,
      province_kh: p.name_kh
    });
    
    p.districts.forEach(d => {
      flatNcddList.push({
        type: 'district',
        code: d.code,
        name_en: d.name_en,
        name_kh: d.name_kh,
        path_en: `${d.name_en}, ${p.name_en}`,
        path_kh: `${d.name_kh}, ${p.name_kh}`,
        province_en: p.name_en,
        province_kh: p.name_kh,
        district_en: d.name_en,
        district_kh: d.name_kh
      });
      
      d.communes.forEach(c => {
        flatNcddList.push({
          type: 'commune',
          code: c.code,
          name_en: c.name_en,
          name_kh: c.name_kh,
          path_en: `${c.name_en}, ${d.name_en}, ${p.name_en}`,
          path_kh: `${c.name_kh}, ${d.name_kh}, ${p.name_kh}`,
          province_en: p.name_en,
          province_kh: p.name_kh,
          district_en: d.name_en,
          district_kh: d.name_kh,
          commune_en: c.name_en,
          commune_kh: c.name_kh
        });
        
        c.villages.forEach(v => {
          flatNcddList.push({
            type: 'village',
            code: v.code,
            name_en: v.name_en,
            name_kh: v.name_kh,
            path_en: `${v.name_en}, ${c.name_en}, ${d.name_en}, ${p.name_en}`,
            path_kh: `${v.name_kh}, ${c.name_kh}, ${d.name_kh}, ${p.name_kh}`,
            province_en: p.name_en,
            province_kh: p.name_kh,
            district_en: d.name_en,
            district_kh: d.name_kh,
            commune_en: c.name_en,
            commune_kh: c.name_kh,
            village_en: v.name_en,
            village_kh: v.name_kh
          });
        });
      });
    });
  });

  // Infer coordinates for NCDD divisions based on nearest local route matches
  const normalizedRoutes = routes.map(r => ({
    latitude: r.latitude,
    longitude: r.longitude,
    prov: normalizeKhmer(r.province_kh || r.province || '').toLowerCase(),
    vill: normalizeKhmer(r.village_kh || r.village || '').toLowerCase(),
    comm: normalizeKhmer(r.commune_kh || r.commune || '').toLowerCase(),
    dist: normalizeKhmer(r.district_kh || r.district || '').toLowerCase()
  }));

  flatNcddList.forEach(item => {
    const itemProv = normalizeKhmer(item.province_kh || '').toLowerCase();
    const matchingRoute = normalizedRoutes.find(r => {
      if (r.prov !== itemProv && !r.prov.includes(itemProv) && !itemProv.includes(r.prov)) return false;

      if (item.type === 'village') {
        const itemVill = normalizeKhmer(item.village_kh || '').toLowerCase();
        return r.vill && (r.vill === itemVill || r.vill.includes(itemVill));
      } else if (item.type === 'commune') {
        const itemComm = normalizeKhmer(item.commune_kh || '').toLowerCase();
        return r.comm && (r.comm === itemComm || r.comm.includes(itemComm));
      } else if (item.type === 'district') {
        const itemDist = normalizeKhmer(item.district_kh || '').toLowerCase();
        return r.dist && (r.dist === itemDist || r.dist.includes(itemDist));
      }
      return false;
    });
    if (matchingRoute) {
      item.latitude = matchingRoute.latitude;
      item.longitude = matchingRoute.longitude;
    }
  });

  console.log(`✅ Pre-flattened ${flatNcddList.length} NCDD administrative records for fast search`);
}

// Search NCDD flat array using prefix/substring matches
function searchNcdd(query, limit = 20) {
  if (typeof normalizeKhmer !== 'function') return [];
  const processedQ = typeof preprocessSpelling === 'function' ? preprocessSpelling(query) : query;
  const normQ = normalizeKhmer(processedQ).toLowerCase();
  if (!normQ) return [];
  
  const matches = [];
  for (const item of flatNcddList) {
    const mKh = normalizeKhmer(item.name_kh).toLowerCase();
    const mEn = normalizeKhmer(item.name_en).toLowerCase();
    
    if (mKh.startsWith(normQ) || mEn.startsWith(normQ)) {
      matches.push(item);
    } else if (mKh.includes(normQ) || mEn.includes(normQ)) {
      matches.push(item);
    }
    
    if (matches.length >= limit * 2) break;
  }
  
  matches.sort((a, b) => {
    const aKh = normalizeKhmer(a.name_kh).toLowerCase();
    const bKh = normalizeKhmer(b.name_kh).toLowerCase();
    const aStartsWith = aKh.startsWith(normQ) || normalizeKhmer(a.name_en).toLowerCase().startsWith(normQ);
    const bStartsWith = bKh.startsWith(normQ) || normalizeKhmer(b.name_en).toLowerCase().startsWith(normQ);
    if (aStartsWith && !bStartsWith) return -1;
    if (!aStartsWith && bStartsWith) return 1;
    return a.path_en.length - b.path_en.length;
  });
  
  return matches.slice(0, limit);
}

// Load NCDD hierarchy
try {
  if (fs.existsSync(NCDD_PATH)) {
    ncddHierarchy = JSON.parse(fs.readFileSync(NCDD_PATH, 'utf-8'));
    console.log(`✅ Loaded NCDD Hierarchy Database (${ncddHierarchy.length} provinces)`);
    initializeNcddFlatList();
    // Improvement #5 & Spatial Branch 10km Auto-Select Integration
    autoPick.init({ flatNcddList, pickupBranches, stripAdministrativePrefixes });
    console.log('✅ Auto-Pick Engine initialized with NCDD data & 10km Spatial Branch Indexer');
  } else {
    console.warn('⚠️ NCDD Hierarchy database file (ncdd_hierarchy.json) not found.');
  }
} catch (err) {
  console.error('❌ Failed to load ncdd_hierarchy.json:', err.message);
}

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
  
  // Apply numeric token filtering on local fuzzy database search
  const queryNums = extractNumericTokens(q);
  if (queryNums.length > 0) {
    searchResults = searchResults.filter(res => {
      const candText = `${res.item.market || ''} ${res.item.market_kh || ''} ${(res.item.aliases || []).join(' ')} ${(res.item.search_keywords || []).join(' ')}`;
      const candNums = extractNumericTokens(candText);
      return queryNums.every(qNum => candNums.includes(qNum));
    });
  }

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
  if (queryNums.length > 0) {
    exactList = exactList.filter(r => {
      const candText = `${r.market || ''} ${r.market_kh || ''} ${(r.aliases || []).join(' ')} ${(r.search_keywords || []).join(' ')}`;
      const candNums = extractNumericTokens(candText);
      return queryNums.every(qNum => candNums.includes(qNum));
    });
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

const PROVINCE_BBOX = {
  'phnom penh': '104.72,11.45,104.99,11.75',
  'siem reap': '103.50,12.80,104.50,14.20',
  'battambang': '102.30,12.50,103.60,13.40',
  'kandal': '104.60,11.00,105.40,11.90',
  'kampong cham': '104.80,11.80,105.80,12.50',
  'kampong chhnang': '104.20,11.70,104.90,12.70',
  'kampong speu': '104.00,11.00,104.80,12.00',
  'kampong thom': '104.30,12.30,105.50,13.20',
  'kampot': '103.80,10.30,104.70,11.00',
  'kep': '104.25,10.40,104.45,10.60',
  'koh kong': '102.80,10.90,104.00,12.00',
  'kratie': '105.70,11.90,106.60,13.00',
  'mondul kiri': '106.70,12.00,107.70,13.30',
  'mondulkiri': '106.70,12.00,107.70,13.30',
  'oddar meanchey': '103.00,13.90,104.50,14.50',
  'otdar meanchey': '103.00,13.90,104.50,14.50',
  'pailin': '102.40,12.70,102.70,13.00',
  'preah sihanouk': '103.30,10.30,104.10,11.20',
  'preah vihear': '104.30,13.30,105.50,14.50',
  'prey veng': '105.10,11.00,105.80,11.90',
  'pursat': '102.70,11.90,104.30,12.80',
  'ratanak kiri': '106.60,13.30,107.70,14.50',
  'ratanakkiri': '106.60,13.30,107.70,14.50',
  'stung treng': '105.70,13.00,106.80,14.40',
  'svay rieng': '105.60,10.90,106.30,11.50',
  'takeo': '104.40,10.70,105.10,11.30',
  'tboung khmum': '105.40,11.70,106.30,12.20',
  'tboungkhmum': '105.40,11.70,106.30,12.20',
  'banteay meanchey': '102.30,13.30,103.40,14.00'
};

function getProvinceBBox(province) {
  if (!province) return '102.35,9.90,107.63,14.69'; // Default Cambodia BBox
  const norm = province.toLowerCase().trim();
  return PROVINCE_BBOX[norm] || '102.35,9.90,107.63,14.69';
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



function convertKhmerToArabicDigits(str) {
  if (!str) return "";
  return str.replace(/[០-៩]/g, d => String.fromCharCode(d.charCodeAt(0) - 0x17E0 + 48));
}

function convertArabicToKhmerDigits(str) {
  if (!str) return "";
  return str.replace(/[0-9]/g, d => String.fromCharCode(d.charCodeAt(0) - 48 + 0x17E0));
}

/** Check if a route matches a free-text query (Unicode normalized and case-insensitive) */
function normalizeKhmer(str) {
  if (!str) return "";
  let normalized = str.normalize("NFC").toLowerCase().trim();
  normalized = normalized.replace(/\u178E\u17D2\u178F/g, "\u178E\u17D2\u178A"); // ណ + ្ត -> ណ + ្ដ
  normalized = normalized.replace(/\u17C1\u17B8/g, "\u17BE"); // decomposed vowel OE (េី -> ើ)
  normalized = normalized.replace(/\u17C1\u17B6/g, "\u17C4"); // decomposed vowel OO (េា -> ោ)
  normalized = normalized.replace(/\u200B|\u200C|\u200D|\uFEFF/g, ""); // Improvement #2: strip all zero-width chars
  // Normalize Khmer numerals to Arabic numerals (០-៩ -> 0-9)
  normalized = convertKhmerToArabicDigits(normalized);
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
function levenshtein(a, b) {
  const dp = Array(a.length + 1).fill(null).map(() => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i-1][j] + 1,
        dp[i][j-1] + 1,
        dp[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}

function findLevenshteinMatches(query, dataset, maxMatches = 5) {
  const normQ = normalizeKhmer(query).toLowerCase();
  if (normQ.length < 2) return [];

  // Set adaptive max distance based on query length
  let maxDist = 2;
  if (normQ.length <= 3) maxDist = 1;
  else if (normQ.length >= 8) maxDist = 3;

  const matches = [];
  const seenKeys = new Set();

  for (const r of dataset) {
    const marketEn = (r.market || '').toLowerCase();
    const marketKh = (r.market_kh || '').toLowerCase();
    
    // Unique key to avoid duplicate markets in results
    const key = `${r.market || ''}||${r.market_kh || ''}`;
    if (seenKeys.has(key)) continue;

    const distEn = levenshtein(normQ, normalizeKhmer(marketEn).toLowerCase());
    const distKh = levenshtein(normQ, normalizeKhmer(marketKh).toLowerCase());
    const minDist = Math.min(distEn, distKh);

    if (minDist <= maxDist) {
      matches.push({ item: r, dist: minDist });
      seenKeys.add(key);
    }
  }

  return matches
    .sort((a, b) => a.dist - b.dist)
    .slice(0, maxMatches)
    .map(m => m.item);
}

app.get('/api/search', (req, res) => {
  const { q = '', branch_id, province, district, limit = 20, page = 1, type } = req.query;

  // Improvement #4: Try phonetic romanization index first
  const phoneticKhmer = autoPick.lookupPhoneticIndex(q);
  const processedQ = preprocessSpelling(phoneticKhmer || q);
  let results = [];
  let fuseScoreMap = {};
  const isMarket = (type === 'market');

  if (isMarket) {
    // ── Variant Learning: check learned variants FIRST before any search ──
    const variantHit = autoPick.lookupVariant(q, province || '');
    if (variantHit) {
      // We already know this misspelling — resolve instantly with high confidence
      const scored = autoPick.scoreAndAutoPick([variantHit], q, province || '', {});
      const total = 1;
      return res.json({
        total, page: 1, limit: parseInt(limit), pages: 1,
        auto_pick: true,
        auto_pick_result: { ...scored.results_with_confidence[0], _from_variant: true },
        variant_hit: true,
        results: scored.results_with_confidence
      });
    }

    // Improvement #3: Province-scoped early filter — scope dataset immediately
    let dataset = routes;
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
      
      // Fuzzy matches as fallback — capture fuse scores for confidence computation
      let fuzzyMatches = [];
      if (exactMatches.length < 15) {
        const tempFuse = new Fuse(dataset, {
          keys: [
            { name: 'market', weight: 0.5 },
            { name: 'market_kh', weight: 0.5 }
          ],
          threshold: 0.5,
          includeScore: true
        });
        const fuseResults = tempFuse.search(processedQ);
        fuzzyMatches = fuseResults.map(res => {
          // Store fuse score keyed by market names for confidence lookup
          const key = `${res.item.market || ''}||${res.item.market_kh || ''}`;
          fuseScoreMap[key] = res.score;
          return res.item;
        });
      }
      
      // Combine and remove duplicates
      const combined = [...exactMatches, ...fuzzyMatches];
      results = Array.from(new Set(combined));

      // If no exact or fuzzy match, try Levenshtein spelling suggestions!
      if (results.length === 0) {
        results = findLevenshteinMatches(processedQ, dataset, 5);
      }

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


  // Improvement #1: Confidence scoring + auto-pick
  let auto_pick = false;
  let auto_pick_result = null;
  if (isMarket && processedQ && results.length > 0) {
    const scored = autoPick.scoreAndAutoPick(results, processedQ, province || '', fuseScoreMap);
    results = scored.results_with_confidence;
    auto_pick = scored.auto_pick;
    auto_pick_result = scored.auto_pick_result;

    // ── Variant Learning: learn mid-confidence fuzzy matches for next time ──
    // If top result is a good-but-not-certain match (60–84), save it as a variant
    if (!auto_pick && results.length > 0 && results[0].confidence >= 60) {
      autoPick.learnVariant(q, results[0], results[0].confidence, false);
    }
  } else if (isMarket && results.length > 0) {
    results = results.map(r => autoPick.enrichWithNcddCodes(r));
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
    auto_pick,
    auto_pick_result,
    results: paginated
  });
});

/**
 * GET /api/auto-pick
 * Dedicated auto-pick endpoint: returns the single best result with confidence score.
 * If confidence >= 85, auto_pick = true and auto_pick_result = the best match.
 * Otherwise, returns ranked candidates for the UI dropdown.
 *
 * Query params: q, province, district, limit (default 5)
 */
app.get('/api/auto-pick', (req, res) => {
  const { q = '', province = '', district = '', limit = 5 } = req.query;

  if (!q.trim()) {
    return res.status(400).json({ error: 'Query parameter q is required' });
  }

  // Improvement #4: Phonetic romanization lookup
  const phoneticKhmer = autoPick.lookupPhoneticIndex(q);
  const processedQ    = preprocessSpelling(phoneticKhmer || q);

  // Improvement #3: Province-scoped early filter
  let dataset = routes;
  if (province) {
    const normProv = normalizeKhmer(province);
    dataset = dataset.filter(r =>
      normalizeKhmer(r.province).includes(normProv) ||
      normalizeKhmer(r.province_kh).includes(normProv)
    );
  }
  if (district) {
    const normDist = normalizeKhmer(district);
    dataset = dataset.filter(r =>
      normalizeKhmer(r.district).includes(normDist) ||
      normalizeKhmer(r.district_kh).includes(normDist)
    );
  }

  // Substring exact matches first
  let results = dataset.filter(r => matchesQuery(r, processedQ));

  // Fuzzy fallback with score capture
  const fuseScoreMap = {};
  if (results.length < 10) {
    const tempFuse = new Fuse(dataset, {
      keys: [
        { name: 'market', weight: 0.5 },
        { name: 'market_kh', weight: 0.5 },
        { name: 'aliases', weight: 0.3 }
      ],
      threshold: 0.5,
      includeScore: true
    });
    const fuseResults = tempFuse.search(processedQ);
    for (const fr of fuseResults) {
      const key = `${fr.item.market || ''}||${fr.item.market_kh || ''}`;
      fuseScoreMap[key] = fr.score;
      if (!results.includes(fr.item)) results.push(fr.item);
    }
  }

  // Levenshtein last resort
  if (results.length === 0) {
    results = findLevenshteinMatches(processedQ, dataset, parseInt(limit));
  }

  // Improvement #1: Confidence scoring + auto-pick
  const scored = autoPick.scoreAndAutoPick(results, processedQ, province, fuseScoreMap);

  res.json({
    query: q,
    phonetic_match: phoneticKhmer || null,
    auto_pick: scored.auto_pick,
    auto_pick_result: scored.auto_pick_result,
    confidence_threshold: autoPick.AUTO_PICK_THRESHOLD,
    candidates: scored.results_with_confidence.slice(0, parseInt(limit))
  });
});


/**
 * POST /api/confirm-pick
 * Called by the app when a user explicitly picks a result from the dropdown.
 * This saves the query → canonical market as a HIGH-CONFIDENCE variant (95),
 * so next time the same misspelling is typed, it auto-picks without asking.
 *
 * Body: { query, market, market_kh, province_kh, district_kh, branch_id, latitude, longitude }
 */
app.post('/api/confirm-pick', (req, res) => {
  const { query, market, market_kh, province_kh, district_kh, branch_id, latitude, longitude } = req.body;
  if (!query || (!market && !market_kh)) {
    return res.status(400).json({ error: 'query and market/market_kh are required' });
  }
  const canonicalResult = { market, market_kh, province_kh, district_kh, branch_id, latitude, longitude };
  autoPick.learnVariant(query, canonicalResult, 95, true);
  res.json({ ok: true, learned: true, query, canonical: market || market_kh });
});

/**
 * GET /api/variants
 * Returns all learned query variants, sorted by hit_count descending.
 * Useful for admin review — see what misspellings are being learned.
 * Optional: ?limit=50 to cap results
 */
app.get('/api/variants', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const variants = autoPick.getAllVariants().slice(0, limit);
  res.json({
    total: variants.length,
    variants
  });
});


/**
 * GET /api/branch/:id
 * Returns branch info, direct routes, AND all related keywords/locations under 12km radius!
 */
app.get('/api/branch/:id', (req, res) => {
  const rawId = req.params.id.trim();
  const id = rawId.toLowerCase().replace(/^po_/, '');
  const directRoutes = routes.filter(r => r.branch_id.toLowerCase() === id || r.branch_id.toLowerCase() === `po_${id}`);
  
  const spatialInfo = spatialIndexer.findLocationsForBranch(id, routes, pickupBranches, 12.0);

  if (directRoutes.length === 0 && (!spatialInfo.branch || spatialInfo.total_locations_under_12km === 0)) {
    return res.status(404).json({ error: `No branch or locations found for branch "${req.params.id}"` });
  }

  res.json({
    branch_id: rawId.toUpperCase(),
    branch: spatialInfo.branch || null,
    total_direct_routes: directRoutes.length,
    direct_routes: directRoutes,
    total_locations_under_12km: spatialInfo.total_locations_under_12km,
    related_locations_12km: spatialInfo.related_locations_12km,
    search_keywords_12km: spatialInfo.search_keywords_12km
  });
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
// Suggestions containing these words are almost never Cambodia place names —
// filter them out so bare/ambiguous queries (like a lone number) don't return
// generic web-search junk (e.g. "2004 chinese zodiac", "2004 tsunami").
const IRRELEVANT_SUGGESTION_PATTERNS = [
  /zodiac/i, /age in \d{4}/i, /tsunami/i, /movie/i, /song/i, /lyrics/i,
  /wikipedia/i, /calendar/i, /horoscope/i, /olympics/i, /election/i,
  /\bnba\b/i, /\bnfl\b/i, /stock price/i, /exchange rate/i
];

app.get('/api/google-autocomplete', async (req, res) => {
  const { q, province } = req.query;
  if (!q || !q.trim()) return res.json([]);

  const query = q.trim();
  // Always anchor the search to Cambodia context. If a province is selected, use it
  // (most specific). Otherwise default-bias towards Phnom Penh, since it's the most
  // searched/most populous area — mirrors how a user would naturally refine a vague
  // Google search like "2004 Phnom Penh" instead of just "2004".
  const isBareNumberOrTooShort = /^\d+$/.test(query) || query.length <= 3;
  const locationContext = province || (isBareNumberOrTooShort ? 'Phnom Penh, Cambodia' : 'Cambodia');
  const searchString = `${query}, ${locationContext}`;

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
    let suggestions = data[1] || [];

    // Filter out obviously irrelevant/generic web-search suggestions
    suggestions = suggestions.filter(s => !IRRELEVANT_SUGGESTION_PATTERNS.some(re => re.test(s)));

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
      const filteredResults = (coords.results || []).filter(r => r.latitude === null || r.latitude === undefined || isWithinCambodia(r.latitude, r.longitude));
      if (filteredResults.length > 0) {
        const enrichedResults = filteredResults.map(r => {
          const inf = (r.latitude !== null && r.latitude !== undefined) ? inferProvinceAndDistrict(r.latitude, r.longitude) : {};
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

          // Check if these are chain brand ambiguity results (never auto-pick these)
          const hasChainPlaceholder = finalResults.some(r =>
            (r.matchedFields || []).includes('chain_brand') || r.market?.includes('add branch')
          );

          // Do not auto-flatten if the resolver returned multiple candidates due to close scores (gap < 3) or generic name
          const hasCloseScores = finalResults.length > 1 && 
                                 Math.abs((finalResults[0].confidence || 0) - (finalResults[1].confidence || 0)) < 3;
          const isGeneric = isGenericName(query);

          if (allInSameProvince && finalResults[0].source !== 'ncdd' && !hasChainPlaceholder && !hasCloseScores && !isGeneric) {

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
            const isPlaceholder = finalResults[0].market?.includes('add branch') || 
                                (finalResults[0].matchedFields || []).includes('chain_brand');
            if (isPlaceholder) {
              return res.json({
                type: 'multiple',
                results: finalResults
              });
            }
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
    } else if (coords.lat === null || coords.lat === undefined || isWithinCambodia(coords.lat, coords.lng)) {
      const inf = (coords.lat !== null && coords.lat !== undefined) ? inferProvinceAndDistrict(coords.lat, coords.lng) : {};
      let matchProv = true;
      if (province) {
        const allowedProvinces = [province];
        const khProv = getKhmerProvince(province);
        if (khProv) allowedProvinces.push(khProv);
        const enProv = getEnglishProvince(province);
        if (enProv) allowedProvinces.push(enProv);
        const normAllowed = allowedProvinces.map(p => normalizeKhmer(p));

        const targetProv = coords.province || inf.province || '';
        const targetProvKh = coords.province_kh || inf.province_kh || '';

        matchProv = normAllowed.some(normP => 
          (targetProv && normalizeKhmer(targetProv).includes(normP)) ||
          (targetProvKh && normalizeKhmer(targetProvKh).includes(normP))
        );
      }

      if (matchProv) {
        return res.json({
          province: coords.province || '',
          province_kh: coords.province_kh || '',
          district: coords.district || '',
          district_kh: coords.district_kh || '',
          commune: coords.commune || '',
          commune_kh: coords.commune_kh || '',
          village: coords.village || '',
          village_kh: coords.village_kh || '',
          ...coords,
          province: coords.province || inf.province || '',
          province_kh: coords.province_kh || inf.province_kh || '',
          district: coords.district || inf.district || '',
          district_kh: coords.district_kh || inf.district_kh || ''
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
  if (process.env.DISABLE_GEOCODING_CACHE === '1') return;
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
        responseMimeType: 'application/json',
        tools: [{ googleSearch: {} }]
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

const KHMER_TYPE_PREFIXES = ['វត្ត', 'ផ្សារ', 'ផ្លូវ', 'ស្ពាន', 'សាលា', 'មន្ទីរពេទ្យ', 'ពេទ្យ', 'បុរី', 'អាកាសយានដ្ឋាន', 'វិមាន'];
const ENGLISH_TYPE_PREFIXES = ['wat', 'phsar', 'psar', 'st', 'street', 'road', 'bridge', 'school', 'hospital', 'clinic', 'borey', 'buri', 'airport', 'monument'];

function stripTypePrefixes(str, isKhmer) {
  if (!str) return '';
  const prefixes = isKhmer ? KHMER_TYPE_PREFIXES : ENGLISH_TYPE_PREFIXES;
  let result = str.trim();
  for (const prefix of prefixes) {
    if (result.startsWith(prefix)) {
      result = result.substring(prefix.length).trim();
      break;
    }
  }
  return result;
}

function naiveRomanizeKhmer(str) {
  if (!str) return '';
  let s = str.normalize('NFC');
  
  const charMap = {
    'ក': 'k', 'ខ': 'kh', 'គ': 'k', 'ឃ': 'kh', 'ង': 'ng',
    'ច': 'ch', 'ឆ': 'chh', 'ជ': 'ch', 'ឈ': 'chh', 'ញ': 'nh',
    'ដ': 'd', 'ឋ': 'th', 'ឌ': 'd', 'ឍ': 'th', 'ណ': 'n',
    'ត': 't', 'ថ': 'th', 'ទ': 't', 'ធ': 'th', 'ន': 'n',
    'ប': 'b', 'ផ': 'ph', 'ព': 'p', 'ភ': 'ph', 'ម': 'm',
    'យ': 'y', 'រ': 'r', 'ល': 'l', 'វ': 'v', 'ស': 's', 'ហ': 'h', 'ឡ': 'l', 'អ': 'o',
    '្': '',
    'ា': 'a', 'ិ': 'i', 'ី': 'i', 'ឹ': 'ue', 'ឺ': 'ue', 'ុ': 'u', 'ូ': 'u', 'ួ': 'ua',
    'ើ': 'oe', 'ឿ': 'oea', 'ៀ': 'ie', 'េ': 'e', 'ែ': 'ae', 'ៃ': 'ai', 'ោ': 'o', 'ៅ': 'au',
    'ំ': 'om', 'ះ': 'ah', 'ៈ': 'a', '៉': '', '៊': '', '់': '', '៌': '', '៍': '', '៏': '', '័': 'a', 'ិ៍': 'i'
  };

  let res = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    res += charMap[c] !== undefined ? charMap[c] : c;
  }
  return res;
}

// Weighted fuzzy matching with length penalty to prevent accidental short substring matches
function calculateScore(candName, query) {
  const n1 = normalizeSearchText(candName);
  const n2 = normalizeSearchText(query);
  const c1 = normalizeCompactText(candName);
  const c2 = normalizeCompactText(query);
  if (!n1 || !n2) return 0;
  if (n1 === n2 || (c1 && c1 === c2)) return 100;

  // Prefix-Stripping Matching Logic
  const isKhmer = /[\u1780-\u17FF]/.test(candName) || /[\u1780-\u17FF]/.test(query);
  const strippedCand = stripTypePrefixes(n1, isKhmer);
  const strippedQuery = stripTypePrefixes(n2, isKhmer);

  if (strippedCand && strippedQuery) {
    const val1 = isKhmer ? naiveRomanizeKhmer(strippedCand) : strippedCand;
    const val2 = isKhmer ? naiveRomanizeKhmer(strippedQuery) : strippedQuery;
    const strippedRatio = fuzz.ratio(val1, val2);
    if (strippedRatio < 55) {
      return 0; // Lock to 0 to prevent incorrect matches due to prefix overlap (e.g. វត្តព្រះកែវ vs វត្តព្រែកថ្លឹង)
    }
  }

  const ratio = fuzz.ratio(n1, n2);
  const tokenSet = fuzz.token_set_ratio(n1, n2);
  
  let finalScore = Math.max(ratio, tokenSet);
  
  // Apply penalty for length discrepancy if it's a tokenSet match
  const lenDiff = Math.abs(n1.length - n2.length);
  if (lenDiff > 0 && finalScore > ratio) {
    const penalty = (lenDiff / Math.max(n1.length, n2.length)) * 40;
    finalScore = Math.max(ratio, finalScore - penalty);
  }
  return finalScore;
}

function normalizeSearchText(value) {
  return normalizeKhmer(value || '')
    .toLowerCase()
    .replace(/[()[\]{}.,#/\\:;'"`!?|_+=*~\-–—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCompactText(value) {
  return normalizeSearchText(value).replace(/[^a-z0-9\u1780-\u17FF]/g, '');
}

function hasUsableCoords(candidate) {
  const lat = Number(candidate && candidate.latitude);
  const lng = Number(candidate && candidate.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && isWithinCambodia(lat, lng);
}

function getCandidateType(item) {
  if (item.object_type) return item.object_type;

  const nameLower = (item.market || item.name || '').toLowerCase();
  const nameKhLower = item.market_kh || item.name_kh || '';
  const haystack = normalizeSearchText(`${nameLower} ${nameKhLower} ${(item.aliases || []).join(' ')} ${(item.search_keywords || []).join(' ')}`);

  if (/\b(bridge|flyover)\b/i.test(nameLower) || haystack.includes('\u179f\u17d2\u1796\u17b6\u1793')) return 'bridge';
  if (/\b(wat|pagoda|temple)\b/i.test(nameLower) || haystack.includes('\u179c\u178f\u17d2\u178f')) return 'pagoda';
  if (/\b(hospital|clinic)\b/i.test(nameLower) || haystack.includes('\u1796\u17c1\u1791\u17d2\u1799') || haystack.includes('\u1798\u1793\u17d2\u1791\u17b8\u179a\u1796\u17c1\u1791\u17d2\u1799')) return 'hospital';
  if (/\b(school|university|rufa|itc|college|institute)\b/i.test(nameLower) || haystack.includes('\u179f\u17b6\u1780\u179b\u179c\u17b7\u1791\u17d2\u1799\u17b6\u179b\u17d0\u1799') || haystack.includes('\u179c\u17b7\u1791\u17d2\u1799\u17b6\u179f\u17d2\u1790\u17b6\u1793') || haystack.includes('\u179f\u17b6\u179b\u17b6')) return 'university';
  if (/\b(airport)\b/i.test(nameLower) || haystack.includes('\u17a2\u17b6\u1780\u17b6\u179f\u1799\u17b6\u1793\u178a\u17d2\u178b\u17b6\u1793')) return 'airport';
  if (/\b(monument|statue)\b/i.test(nameLower) || haystack.includes('\u179c\u17b7\u1798\u17b6\u1793')) return 'monument';
  if (/\b(street|road|boulevard|national road|nr\d+|st\s*\d+)\b/i.test(nameLower) || haystack.includes('\u1795\u17d2\u179b\u17bc\u179c')) return 'road';
  if (/\b(borey|buri)\b/i.test(nameLower) || haystack.includes('\u1794\u17bb\u179a\u17b8')) return 'borey';
  if (/\b(factory|yellow shirt)\b/i.test(nameLower) || haystack.includes('\u179a\u17c4\u1784\u1785\u1780\u17d2\u179a')) return 'landmark';
  if (/\b(market|phsar|psar|psah)\b/i.test(nameLower) || haystack.includes('\u1795\u17d2\u179f\u17b6\u179a')) return 'market';
  return 'business';
}

function getQueryTypeIntents(query) {
  const text = normalizeSearchText(query);
  const compact = normalizeCompactText(query);
  const intents = [];

  if (text.includes('\u179f\u17d2\u1796\u17b6\u1793') || /\b(bridge|flyover)\b/.test(text)) intents.push('bridge');
  if (text.includes('\u179c\u178f\u17d2\u178f') || /\b(wat|pagoda|temple)\b/.test(text)) intents.push('pagoda');
  if (text.includes('\u1795\u17d2\u179f\u17b6\u179a') || /\b(phsar|psar|psah|market)\b/.test(text)) intents.push('market');
  if (text.includes('\u1795\u17d2\u179b\u17bc\u179c') || /\b(street|st|road|boulevard|blvd|national road|nr)\b/.test(text) || /^st\d+/.test(compact)) intents.push('road');
  if (text.includes('\u1796\u17c1\u1791\u17d2\u1799') || text.includes('\u1798\u1793\u17d2\u1791\u17b8\u179a\u1796\u17c1\u1791\u17d2\u1799') || /\b(hospital|clinic)\b/.test(text)) intents.push('hospital');
  if (text.includes('\u179f\u17b6\u1780\u179b\u179c\u17b7\u1791\u17d2\u1799\u17b6\u179b\u17d0\u1799') || text.includes('\u179c\u17b7\u1791\u17d2\u1799\u17b6\u179f\u17d2\u1790\u17b6\u1793') || text.includes('\u179f\u17b6\u179b\u17b6') || /\b(university|school|institute|college)\b/.test(text)) intents.push('university');
  if (text.includes('\u17a2\u17b6\u1780\u17b6\u179f\u1799\u17b6\u1793\u178a\u17d2\u178b\u17b6\u1793') || /\bairport\b/.test(text)) intents.push('airport');
  if (text.includes('\u179c\u17b7\u1798\u17b6\u1793') || /\b(monument|statue)\b/.test(text)) intents.push('monument');
  if (text.includes('\u1794\u17bb\u179a\u17b8') || /\b(borey|buri)\b/.test(text)) intents.push('borey');

  return Array.from(new Set(intents));
}

function isTypeCompatible(candidateType, queryIntents) {
  if (queryIntents.length === 0) return true;
  if (queryIntents.includes(candidateType)) return true;
  if (queryIntents.includes('university') && candidateType === 'school') return true;
  if (queryIntents.includes('road') && candidateType === 'bridge') return true;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// ALIAS DICTIONARY: Common alias → canonical name mappings
// Used by Exact Match Lock to resolve alternative names before fuzzy matching.
// ─────────────────────────────────────────────────────────────────────────────
const ALIAS_DICTIONARY = {
  // Hospitals
  'ពេទ្យរុស្ស៊ី': 'Khmer-Soviet Friendship Hospital',
  'មន្ទីរពេទ្យរុស្ស៊ី': 'Khmer-Soviet Friendship Hospital',
  'ពេទ្យម៉ៅ': 'Khmer-Soviet Friendship Hospital',
  'Russe Hospital': 'Khmer-Soviet Friendship Hospital',
  'ពេទ្យបារាំង': 'Calmette Hospital',
  'ពេទ្យកាលម៉ែត': 'Calmette Hospital',
  'ពេទ្យជប៉ុន': 'Japan-Cambodia Friendship Hospital',
  'ពេទ្យព្រះកុសុម': 'Preah Kossamak Hospital',
  'ពេទ្យកុមារ': 'National Pediatric Hospital',
  // Famous Markets
  'ផ្សារធំ': 'Central Market',
  'ផ្សារកណ្ដាល': 'Central Market',
  'ចំការម៉ន': 'Chamkar Mon',
  // Landmarks
  'ភ្នំពេញ': 'Phnom Penh',
  'ព្រះបរមរាជវាំង': 'Royal Palace',
  'អ្នកគ្រប់គ្រងប្រទេស': 'Royal Palace',
  'Wat Phnom': 'Wat Phnom',
  'វត្តភ្នំ': 'Wat Phnom',
  'ផ្សារអូឡាំពិច': 'Olympic Market',
  'ស្ពានជ្រោយចង្វារ': 'Chroy Changvar Bridge',
  'ស្ពានជ្រោយចង្វា': 'Chroy Changvar Bridge',
  'ស្ពានព្រែកព្នៅ': 'Prek Pnov Bridge',
  'ស្ពានអ្នកវ៉ាន': 'Chroy Changvar Bridge',
  'ស្ពានព្រះស្ទឹងមានជ័យ': 'Steung Meanchey Bridge',
  // Airport
  'សាកលអន្ដរជាតិភ្នំពេញ': 'Phnom Penh International Airport',
  'អាកាសយានដ្ឋានភ្នំពេញ': 'Phnom Penh International Airport',
  'Pochentong Airport': 'Phnom Penh International Airport',
  // Alias for BKK
  'BKK': 'Boeung Keng Kang Market',
  'BKK1': 'Boeung Keng Kang 1',
  'BKK2': 'Boeung Keng Kang 2',
  'BKK3': 'Boeung Keng Kang 3',
  'បឹងកេងកង': 'Boeung Keng Kang Market',
};

// ─────────────────────────────────────────────────────────────────────────────
// NATIONALLY SIGNIFICANT LANDMARKS: curated list bypassing fuzzy logic
// ─────────────────────────────────────────────────────────────────────────────
const NATIONALLY_SIGNIFICANT_LANDMARKS = [
  'Wat Phnom', 'វត្តភ្នំ',
  'Royal Palace', 'ព្រះបរមរាជវាំង',
  'Central Market', 'ផ្សារធំថ្មី', 'ផ្សារធំ',
  'Olympic Market', 'ផ្សារអូឡាំពិច',
  'Chroy Changvar Bridge', 'ស្ពានជ្រោយចង្វារ', 'ស្ពានជ្រោយចង្វា',
  'Phnom Penh International Airport', 'សាកលអន្ដរជាតិភ្នំពេញ', 'Pochentong Airport',
  'Independence Monument', 'វិមានឯករាជ្យ',
  'National Museum', 'សារមន្ទីរជាតិ',
  'Tuol Sleng Museum', 'ទួលស្លែង',
  'Angkor Wat',
  'Preah Vihear',
  'Tonle Sap Lake',
  'Khmer-Soviet Friendship Hospital', 'ពេទ្យរុស្ស៊ី',
  'Calmette Hospital', 'ពេទ្យបារាំង',
];

// ─────────────────────────────────────────────────────────────────────────────
// GENERIC NAMES: These should return "Ambiguous" without admin context
// ─────────────────────────────────────────────────────────────────────────────
const GENERIC_LOCATION_NAMES = new Set([
  // Khmer generic temple names
  'វត្តថ្មី', 'វត្តចាស់', 'វត្តភូមិ', 'វត្តខ្មែរ',
  // Khmer generic market names
  'ផ្សារថ្មី', 'ផ្សារចាស់', 'ផ្សារភូមិ', 'ផ្សារខ្មែរ',
  // Khmer generic school names
  'សាលាថ្មី', 'សាលាចាស់',
  // English equivalents
  'new market', 'old market', 'new pagoda', 'old pagoda', 'village pagoda',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Strip phone numbers from query text
// ─────────────────────────────────────────────────────────────────────────────
function stripPhoneNumbers(query) {
  if (!query) return '';
  // Remove Cambodian phone formats: 0xx xxx xxxx, +855, 855xxxxxxxx, etc.
  return query
    .replace(/(?:(?:\+|00)855|0)\s*(?:\d[\s-]?){7,10}/g, '')
    .replace(/\b\d{9,12}\b/g, '')  // bare number blocks 9-12 digits
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Extract numeric tokens (Arabic, Khmer numerals, alphanumeric codes)
// ─────────────────────────────────────────────────────────────────────────────
// Use existing convertKhmerToArabicDigits from utils above
function convertKhmerDigits(str) {
  return convertKhmerToArabicDigits(str || '');
}


function extractNumericTokens(text) {
  if (!text) return [];
  const normalized = convertKhmerDigits(String(text));
  // Match: pure numbers, alphanumeric codes like "6A", "NR1", "St.271"
  const tokens = normalized.match(/\b(?:nr\s*\d+|\d+[a-z]*|[a-z]+\d+)\b/gi) || [];
  return tokens.map(t => t.toLowerCase().replace(/\s+/g, ''));
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Detect if query is a generic/ambiguous name
// ─────────────────────────────────────────────────────────────────────────────
function isGenericName(query) {
  if (!query) return false;
  const normQ = normalizeKhmer(query).toLowerCase().replace(/\s+/g, '');
  for (const genericName of GENERIC_LOCATION_NAMES) {
    const normGeneric = normalizeKhmer(genericName).toLowerCase().replace(/\s+/g, '');
    if (normQ === normGeneric) return true;
  }
  return false;
}

const CHAIN_BRANDS = [

  { brand: 'AEON', aliases: ['aeon', '\u17a2\u17ca\u17b8\u17a2\u1793'] },
  { brand: 'ABA', aliases: ['aba', '\u17a2\u17c1\u1794\u17ca\u17b8\u17a2\u17c1'] },
  { brand: 'ACLEDA', aliases: ['acleda', '\u17a2\u17c1\u179f\u17ca\u17b8\u179b\u17b8\u178a\u17b6'] },
  { brand: 'Wing', aliases: ['wing', '\u179c\u17b8\u1784'] }
];

function getMentionedChains(query) {
  const compact = normalizeCompactText(query);
  const upper = String(query || '').toUpperCase();
  return CHAIN_BRANDS.filter(chain =>
    upper.includes(chain.brand.toUpperCase()) ||
    chain.aliases.some(alias => compact.includes(normalizeCompactText(alias)))
  );
}

function hasAdditionalChainLocation(query, chain) {
  let compact = normalizeCompactText(query);
  chain.aliases.forEach(alias => {
    const aliasCompact = normalizeCompactText(alias);
    compact = compact.replace(new RegExp(aliasCompact, 'g'), '');
  });

  const genericWords = ['bank', 'branch', 'maxvalu', 'maxvalue', 'express', 'store', 'atm'];
  genericWords.forEach(word => {
    compact = compact.replace(new RegExp(word, 'g'), '');
  });

  return compact.length >= 3;
}

function candidateMatchesChain(candidate, chain) {
  const compact = normalizeCompactText(`${candidate.name || ''} ${candidate.name_kh || ''} ${(candidate.matchedFields || []).join(' ')}`);
  return chain.aliases.some(alias => compact.includes(normalizeCompactText(alias)));
}

function formatAmbiguousCandidate(candidate) {
  return {
    id: candidate.code || `c_${candidate.name}_${Date.now()}`,
    source: candidate.source,
    market: candidate.name,
    market_kh: candidate.name_kh || '',
    province: candidate.province,
    province_kh: candidate.province_kh || '',
    district: candidate.district,
    district_kh: candidate.district_kh || '',
    commune: candidate.commune || '',
    commune_kh: candidate.commune_kh || '',
    village: candidate.village || '',
    village_kh: candidate.village_kh || '',
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    lat: candidate.latitude,
    lon: candidate.longitude,
    confidence: Math.round(candidate.finalScore || candidate.baseScore || 0),
    matchedFields: candidate.matchedFields,
    reason: candidate.reason || `Candidate match (confidence: ${Math.round(candidate.finalScore || candidate.baseScore || 0)}%)`,
    display_name: `${candidate.name_kh || candidate.name}, ${candidate.commune || ''}, ${candidate.district || ''}, ${candidate.province || ''}, Cambodia`
  };
}

function makeChainAmbiguityResult(chain, candidates) {
  const chainCandidates = candidates
    .filter(candidate => candidateMatchesChain(candidate, chain))
    .filter(hasUsableCoords)
    .slice(0, 8);

  const results = chainCandidates.length > 0
    ? chainCandidates.map(formatAmbiguousCandidate)
    : [{
        id: `chain_${chain.brand.toLowerCase()}_needs_location`,
        market: `${chain.brand} - add branch or nearby location`,
        market_kh: '',
        province: '',
        province_kh: '',
        district: '',
        district_kh: '',
        latitude: null,
        longitude: null,
        lat: null,
        lon: null,
        confidence: 0,
        matchedFields: ['chain_brand'],
        reason: `${chain.brand} has many branches. Add a nearby market, road, sangkat, or branch name.`
      }];

  return { type: 'multiple', results };
}

function checkExactMatchLock(query, province = '') {
  const cleanQ = stripPhoneNumbers(query).trim();

  // Use strict NFC normalization (not the lossy normalizeKhmer) for exact comparisons
  // to prevent different Khmer words from colliding after subscript stripping
  const strictNorm = (s) => (s || '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
  const normQ = strictNorm(cleanQ);
  const normQEn = cleanQ.toLowerCase().replace(/[^a-z0-9]/g, '');

  // ALIAS DICTIONARY lookup - strict comparison only
  // Skip chain brands here - they are handled separately by the chain detection logic
  const mentionedChainBrands = getMentionedChains(cleanQ);
  const isMerelyChainQuery = mentionedChainBrands.length > 0 && !hasAdditionalChainLocation(cleanQ, mentionedChainBrands[0]);
  if (isMerelyChainQuery) {
    return null; // Let chain detection handle this
  }

  let aliasTarget = '';
  for (const [aliasKey, targetValue] of Object.entries(ALIAS_DICTIONARY)) {
    const normKey = strictNorm(aliasKey);
    const normKeyEn = aliasKey.toLowerCase().replace(/[^a-z0-9]/g, '');
    // Only match if exact or english-only match (not normalized-stripped comparison)
    if (normQ === normKey || (normKeyEn.length >= 3 && normQEn === normKeyEn)) {
      aliasTarget = targetValue;
      break;
    }
  }

  const searchName = aliasTarget || cleanQ;
  const normSearch = strictNorm(searchName);
  const normSearchEn = searchName.toLowerCase().replace(/[^a-z0-9]/g, '');

  const match = famousMarkets.find(m => {
    const mName = strictNorm(m.market);
    const mNameKh = strictNorm(m.market_kh || '');
    // Also check English alphanumeric form for English-named entries
    const mNameEn = (m.market || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const matchName = mName === normSearch || mNameKh === normSearch ||
      (normSearchEn.length >= 3 && (mNameEn === normSearchEn));
    if (matchName) {
      if (province) {
        const pEn = (m.province || '').toLowerCase();
        const normProv = province.toLowerCase();
        return pEn.includes(normProv) || normProv.includes(pEn);
      }
      return true;
    }
    const matchAlias = (m.aliases || []).some(a => {
      const aNorm = strictNorm(a);
      const aNormEn = a.toLowerCase().replace(/[^a-z0-9]/g, '');
      return aNorm === normSearch || (aNormEn.length >= 3 && aNormEn === normSearchEn);
    });
    if (matchAlias) {
      if (province) {
        const pEn = (m.province || '').toLowerCase();
        const normProv = province.toLowerCase();
        return pEn.includes(normProv) || normProv.includes(pEn);
      }
      return true;
    }
    return false;
  });


  if (match) {
    console.log(`🎯 Exact Match Lock triggered for: "${query}" -> "${match.market}"`);
    return {
      lat: match.latitude,
      lng: match.longitude,
      name: match.market_kh ? `${match.market_kh} (${match.market})` : match.market,
      province: match.province || '',
      province_kh: match.province_kh || '',
      district: match.district || '',
      district_kh: match.district_kh || '',
      commune: match.commune || '',
      commune_kh: match.commune_kh || '',
      village: match.village || '',
      village_kh: match.village_kh || '',
      confidence: 100,
      matchedFields: ['exact_match_lock'],
      reason: `Selected top candidate "${match.market}" via Exact Match Lock with 100% confidence.`
    };
  }
  return null;
}

async function resolveCoordsWithSpellingCorrection(query, province = '') {
  // 0. Exact Match Lock check first (highest priority)
  const exactLockResult = checkExactMatchLock(query, province);
  if (exactLockResult) {
    return exactLockResult;
  }

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

  // ── ENTITY EXTRACTION FOR NATURAL-LANGUAGE ADDRESSES ──
  // Extract location entities from sentences like:
  // "ផ្ទះនៅជិតក្បែរខាងក្រោយទល់មុខច្រកចូលទីតាំងម្ដុំភូមិត្រពាំងល្វា"
  let extractedEntities = [];
  let primaryEntity = null;
  let entityQueries = [];
  
  try {
    const { extractEntities, getPrimaryEntity, generateSearchQueries } = require('./lib/entity_extractor.js');
    extractedEntities = extractEntities(query);
    primaryEntity = getPrimaryEntity(extractedEntities);
    entityQueries = generateSearchQueries(extractedEntities);
    
    if (extractedEntities.length > 0) {
      console.log(`🔍 Extracted ${extractedEntities.length} entities from query: "${query}"`);
      console.log(`   Primary entity: "${primaryEntity?.value}" (${primaryEntity?.type})`);
      extractedEntities.forEach(e => console.log(`   - ${e.type}: "${e.value}" (score: ${e.score})`));
    }
  } catch (err) {
    console.warn('⚠️ Entity extraction failed:', err.message);
  }

  // Strip phone numbers from query and check cache
  const cleanQ = stripPhoneNumbers(query).trim();
  let cleanCacheQ = cleanQ;
  if (cleanCacheQ.toLowerCase() !== 'cambodia') {
    cleanCacheQ = cleanCacheQ.replace(/,\s*cambodia$/gi, '').replace(/\s+cambodia$/gi, '').trim();
  }
  const processedQuery = preprocessSpelling(cleanCacheQ);
  const normQ = normalizeKhmer(processedQuery);
  const normQuery = processedQuery.toLowerCase().replace(/[^a-z0-9]/g, '');
  const queryIntents = getQueryTypeIntents(processedQuery);
  const mentionedChains = getMentionedChains(processedQuery);

  // ── ENTITY-BASED SEARCH ENHANCEMENT ──
  // If we extracted a primary entity, use it as the main search term
  // This ensures that "ផ្ទះនៅជិតភូមិត្រពាំងល្វា" searches for "ត្រពាំងល្វា" not the whole sentence
  let searchQuery = processedQuery;
  let searchQueryKh = normQ;
  if (primaryEntity && primaryEntity.value) {
    // Use the primary entity for matching, but keep full query for context
    searchQuery = primaryEntity.value;
    searchQueryKh = normalizeKhmer(primaryEntity.value);
    console.log(`   Using extracted entity "${primaryEntity.value}" as search term`);
  }

  // Chain Business Check MUST happen BEFORE cache (cache may have stale ambiguous entries)
  const earlyChainCheck = mentionedChains.find(chain => !hasAdditionalChainLocation(processedQuery, chain));
  if (earlyChainCheck) {
    console.log(`⛓️ Early chain ambiguity: ${earlyChainCheck.brand}`);
    // Gather chain-specific candidates from famous_markets for the ambiguity dropdown
    const chainCandidates = famousMarkets.filter(m => {
      const mCompact = normalizeCompactText(`${m.market || ''} ${m.market_kh || ''}`);
      return earlyChainCheck.aliases.some(alias => mCompact.includes(normalizeCompactText(alias)));
    }).map(m => ({
      source: 'famous_market',
      name: m.market,
      name_kh: m.market_kh,
      latitude: m.latitude,
      longitude: m.longitude,
      province: m.province,
      matchedFields: ['chain_brand'],
      reason: `${earlyChainCheck.brand} has many branches. Please specify a branch location.`
    }));
    return makeChainAmbiguityResult(earlyChainCheck, chainCandidates);
  }

  // Generic Name check BEFORE cache (cache may have stale single-result for generic names)
  if (isGenericName(processedQuery)) {
    console.log(`⚠️ Generic name detected early: "${processedQuery}". Skipping cache; will force ambiguous.`);
    // Don't use cache for generic names - fall through to full pipeline where ambiguity will be enforced
  } else if (process.env.DISABLE_GEOCODING_CACHE !== '1' && geocodingCache[normQ]) {
    const cached = geocodingCache[normQ];
    console.log(`🎯 Geocoding Cache Hit for: "${query}" -> (${cached.lat}, ${cached.lng})`);
    return {
      lat: cached.lat,
      lng: cached.lng,
      name: cached.display_name
    };
  }


  if (!normQuery && !normQ) {
    return null;
  }

  // 1. Gather all candidates
  const candidates = [];

  // Gather NCDD candidates
  flatNcddList.forEach(item => {
    let score = 0;
    const matchedFields = [];
    const normNameKh = normalizeKhmer(item.name_kh || '').toLowerCase();
    const normNameEn = normalizeKhmer(item.name_en || '').toLowerCase();

    // Use searchQueryKh (extracted entity) if available, otherwise use normQ
    const matchTargetKh = searchQueryKh || normQ;
    const matchTargetEn = (searchQuery || processedQuery).toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

    if (normNameKh && normNameKh.length >= 2 && normNameKh === matchTargetKh) {
      score = 100;
      matchedFields.push('name_kh');
    } else if (normNameEn && normNameEn.length >= 2 && normNameEn === matchTargetEn) {
      score = 100;
      matchedFields.push('name_en');
    } else {
      const scoreKh = (normNameKh && normNameKh.length >= 2) ? calculateScore(normNameKh, matchTargetKh) : 0;
      const scoreEn = (normNameEn && normNameEn.length >= 2) ? calculateScore(normNameEn, matchTargetEn) : 0;
      score = Math.max(scoreKh, scoreEn);
      if (score > 60) {
        matchedFields.push('fuzzy_name');
      }
    }

    if (score > 60) {
      candidates.push({
        type: 'administrative',
        source: 'ncdd',
        name: item.path_en,
        name_kh: item.path_kh,
        code: item.code,
        latitude: item.latitude || null,
        longitude: item.longitude || null,
        province: item.province_en,
        province_kh: item.province_kh,
        district: item.district_en,
        district_kh: item.district_kh,
        commune: item.commune_en,
        commune_kh: item.commune_kh,
        village: item.village_en,
        village_kh: item.village_kh,
        objectType: 'administrative',
        baseScore: score,
        matchedFields: matchedFields
      });
    }
  });

  // Gather Famous Markets and Curated Landmarks candidates
  famousMarkets.forEach(m => {
    let score = 0;
    const matchedFields = [];
    const normMarket = normalizeKhmer(m.market || '').toLowerCase();
    const normMarketKh = normalizeKhmer(m.market_kh || '').toLowerCase();

    // Determine sub-type
    let candType = getCandidateType(m);

    // Use searchQueryKh (extracted entity) if available, otherwise use normQ
    const matchTargetKh = searchQueryKh || normQ;
    const matchTargetEn = (searchQuery || processedQuery).toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

    // Exact match checks
    if (normMarketKh && normMarketKh.length >= 2 && normMarketKh === matchTargetKh) {
      score = 100;
      matchedFields.push('market_kh');
    } else if (normMarket && normMarket.length >= 2 && normMarket === matchTargetEn) {
      score = 100;
      matchedFields.push('market_en');
    } else {
      const scoreKh = (normMarketKh && normMarketKh.length >= 2) ? calculateScore(normMarketKh, matchTargetKh) : 0;
      const scoreEn = (normMarket && normMarket.length >= 2) ? calculateScore(normMarket, matchTargetEn) : 0;
      score = Math.max(scoreKh, scoreEn);
      if (score > 60) matchedFields.push('fuzzy_market');

      // Check aliases
      (m.aliases || []).forEach(a => {
        const normA = normalizeKhmer(a).toLowerCase();
        if (normA && normA.length >= 2) {
          const scoreA = calculateScore(normA, matchTargetKh);
          if (scoreA > score) {
            score = scoreA;
            matchedFields.push('alias');
          }
        }
      });

      // Check search keywords
      (m.search_keywords || []).forEach(k => {
        const normK = normalizeKhmer(k).toLowerCase();
        if (normK && normK.length >= 2) {
          const scoreK = calculateScore(normK, matchTargetKh);
          if (scoreK > score) {
            score = scoreK;
            matchedFields.push('keyword');
          }
        }
      });
    }

    if (score > 60) {
      candidates.push({
        type: candType,
        source: 'famous_market',
        name: m.market,
        name_kh: m.market_kh,
        latitude: m.latitude,
        longitude: m.longitude,
        province: m.province,
        province_kh: m.province_kh,
        district: m.district,
        district_kh: m.district_kh,
        aliases: m.aliases,
        search_keywords: m.search_keywords,
        objectType: candType,
        priorityScore: Number(m.priority_score || m.confidence || 0),
        baseScore: score,
        matchedFields: matchedFields
      });
    }
  });

  const chainNeedingLocation = mentionedChains.find(chain => !hasAdditionalChainLocation(processedQuery, chain));
  if (chainNeedingLocation) {
    return makeChainAmbiguityResult(chainNeedingLocation, candidates);
  }

  // ── CURATED LANDMARK EXACT MATCH PRIORITY ──
  // Curated landmarks with high priority_score that match exactly should resolve immediately
  // This prevents fuzzy matching from overriding well-known locations
  const curatedExactMatch = candidates.find(c => {
    if (c.source !== 'famous_market') return false;
    if (!c.priorityScore || c.priorityScore < 85) return false;
    if (c.baseScore < 95) return false;
    return true;
  });
  
  if (curatedExactMatch && curatedExactMatch.latitude && curatedExactMatch.longitude) {
    console.log(`🏆 Curated landmark exact match: "${curatedExactMatch.name}" (score: ${curatedExactMatch.baseScore}, priority: ${curatedExactMatch.priorityScore})`);
    const result = {
      lat: curatedExactMatch.latitude,
      lng: curatedExactMatch.longitude,
      name: curatedExactMatch.name_kh ? `${curatedExactMatch.name_kh} (${curatedExactMatch.name})` : curatedExactMatch.name,
      province: curatedExactMatch.province || '',
      province_kh: curatedExactMatch.province_kh || '',
      district: curatedExactMatch.district || '',
      district_kh: curatedExactMatch.district_kh || '',
      object_type: curatedExactMatch.objectType || curatedExactMatch.type,
      confidence: 100,
      matchedFields: curatedExactMatch.matchedFields,
      reason: `Curated landmark exact match: "${curatedExactMatch.name}" with priority ${curatedExactMatch.priorityScore}.`
    };
    saveToGeocodingCache(query, result.lat, result.lng, result.name);
    return result;
  }

  // If no good local candidates, try online geocoding to discover candidates
  const hasGoodLocal = candidates.some(c => c.baseScore >= 80);
  if (!hasGoodLocal) {
    try {
      const geoResult = await queryGoogleGeocode(cleanQ, province);
      if (geoResult) {
        const resultsArray = geoResult.type === 'multiple' ? geoResult.results : [geoResult];
        resultsArray.forEach(r => {
          const candType = getCandidateType(r);
          const score = calculateScore(r.market || r.name || '', cleanQ);
          candidates.push({
            type: candType,
            source: 'google_geocode',
            name: r.market || r.name || cleanQ,
            name_kh: r.market_kh || '',
            latitude: r.latitude || r.lat,
            longitude: r.longitude || r.lng,
            province: r.province || '',
            province_kh: r.province_kh || '',
            district: r.district || '',
            district_kh: r.district_kh || '',
            objectType: candType,
            baseScore: score,
            matchedFields: ['google_geocode']
          });
        });
      }
    } catch (err) {
      console.warn('Online geocoder candidate discovery skipped:', err.message);
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  // 2. Filter candidates by requested Province (or default context)
  let detectedProvince = province;
  let detectedDistrict = '';
  
  // Enhanced province/district detection from query text
  if (!detectedProvince) {
    const provWords = [
      { en: 'phnom penh', kh: 'ភ្នំពេញ' },
      { en: 'kandal', kh: 'កណ្តាល' },
      { en: 'siem reap', kh: 'សៀមរាប' },
      { en: 'sihanoukville', kh: 'ព្រះសីហនុ' },
      { en: 'kampong cham', kh: 'កំពង់ចាម' },
      { en: 'battambang', kh: 'បាត់ដំបង' },
      { en: 'takeo', kh: 'តាកែវ' },
      { en: 'pursat', kh: 'ពោធិ៍សាត់' },
      { en: 'prey veng', kh: 'ព្រៃវែង' },
      { en: 'kampot', kh: 'កំពត' },
      { en: 'kratie', kh: 'ក្រចេះ' },
      { en: 'stung treng', kh: 'ស្ទឹងត្រែង' },
      { en: 'svay rieng', kh: 'ស្វាយរៀង' },
      { en: 'koh kong', kh: 'កោះកុង' },
      { en: 'mondulkiri', kh: 'មណ្ឌលគីរី' },
      { en: 'ratanakkiri', kh: 'រតនគីរី' },
      { en: 'preah vihear', kh: 'ព្រះវិហារ' },
      { en: 'banteay meanchey', kh: 'បន្ទាយមានជ័យ' },
      { en: 'oddar meanchey', kh: 'ឧត្តរមានជ័យ' },
      { en: 'tboung khmum', kh: 'ត្បូងឃ្មុំ' }
    ];
    for (const pw of provWords) {
      if (normQuery.includes(pw.en.replace(/\s+/g, '')) || normQ.includes(pw.kh)) {
        detectedProvince = pw.en;
        break;
      }
    }
  }
  
  // Detect Phnom Penh district names in query (implies province = Phnom Penh)
  const phnomPenhDistricts = [
    { en: 'daun penh', kh: 'ដូនពេញ' },
    { en: 'chamkar mon', kh: 'ចំការមន' },
    { en: 'prampir meakkara', kh: 'ប្រាំពីរមករា' },
    { en: 'tuol kouk', kh: 'ទួលគោក' },
    { en: 'dangkao', kh: 'ដង្កោ' },
    { en: 'meanchey', kh: 'មានជ័យ' },
    { en: 'pur senchey', kh: 'ពោធិ៍សែនជ័យ' },
    { en: 'sen sok', kh: 'សែនសុខ' },
    { en: 'chbar ampov', kh: 'ច្បារអំពៅ' },
    { en: 'chroy changvar', kh: 'ជ្រោយចង្វារ' },
    { en: 'prek pnov', kh: 'ព្រែកព្នៅ' },
    { en: 'russei keo', kh: 'ឫស្សីកែវ' },
    { en: 'kamboul', kh: 'កំបូល' }
  ];
  
  for (const dist of phnomPenhDistricts) {
    if (normQuery.includes(dist.en.replace(/\s+/g, '')) || normQ.includes(dist.kh)) {
      if (!detectedProvince) detectedProvince = 'phnom penh';
      detectedDistrict = dist.en;
      break;
    }
  }
  
  console.log(`   Province detected: "${detectedProvince || 'none'}", District detected: "${detectedDistrict || 'none'}"`);

  let filteredCandidates = candidates;
  
  // ── STRICT PROVINCE FILTERING ──
  // When province is detected from query text, completely discard candidates from other provinces
  // This prevents fuzzy matching from overriding administrative boundaries
  if (detectedProvince) {
    const normDet = normalizeKhmer(detectedProvince).toLowerCase();
    const provinceFiltered = candidates.filter(c => {
      const pEn = normalizeKhmer(c.province || '').toLowerCase();
      const pKh = normalizeKhmer(c.province_kh || '').toLowerCase();
      return pEn.includes(normDet) || normDet.includes(pEn) || pKh.includes(normDet) || normDet.includes(pKh);
    });
    
    // Only use province-filtered results if we found any
    if (provinceFiltered.length > 0) {
      filteredCandidates = provinceFiltered;
    }
    // If district is also detected, further filter
    if (detectedDistrict && filteredCandidates.length > 1) {
      const normDist = normalizeKhmer(detectedDistrict).toLowerCase();
      const distFiltered = filteredCandidates.filter(c => {
        const dEn = normalizeKhmer(c.district || '').toLowerCase();
        const dKh = normalizeKhmer(c.district_kh || '').toLowerCase();
        return dEn.includes(normDist) || normDist.includes(dEn) || dKh.includes(normDist) || normDist.includes(dKh);
      });
      if (distFiltered.length > 0) {
        filteredCandidates = distFiltered;
      }
    }
  } else {
    filteredCandidates.forEach(c => {
      const pEn = (c.province || '').toLowerCase();
      if (pEn !== 'phnom penh' && pEn !== 'phnompenh') {
        c.baseScore -= 15; // Penalty for province jumping!
      }
    });
  }

  filteredCandidates = filteredCandidates.filter(hasUsableCoords);

  // Apply Numeric Token rules matching
  const queryNums = extractNumericTokens(processedQuery);
  if (queryNums.length > 0) {
    filteredCandidates = filteredCandidates.filter(c => {
      const candText = `${c.name || ''} ${c.name_kh || ''} ${(c.aliases || []).join(' ')} ${(c.search_keywords || []).join(' ')}`;
      const candNums = extractNumericTokens(candText);
      return queryNums.every(qNum => candNums.includes(qNum));
    });
  }

  // ── ENTITY-BASED SCORING ──
  // Boost candidates that match extracted entities
  if (extractedEntities.length > 0) {
    try {
      const { scoreCandidatesByEntities } = require('./lib/entity_extractor.js');
      filteredCandidates = scoreCandidatesByEntities(filteredCandidates, extractedEntities);
      console.log(`   Entity scoring applied: top candidate matched ${filteredCandidates[0]?.matchedEntityCount || 0} entities`);
    } catch (err) {
      console.warn('⚠️ Entity scoring failed:', err.message);
    }
  }

  // Pre-filter candidates by identified object type intents
  if (queryIntents.length > 0) {
    filteredCandidates = filteredCandidates.filter(c => {
      const candType = c.objectType || c.type;
      return isTypeCompatible(candType, queryIntents);
    });
  }

  if (filteredCandidates.length === 0) {
    return null;
  }

  // 3. Apply Hierarchical Priority Scoring
  filteredCandidates.forEach(c => {
    let priorityBonus = 0;
    const candidateType = c.objectType || c.type;
    switch (candidateType) {
      case 'administrative':
        priorityBonus = 50;
        break;
      case 'bridge':
        priorityBonus = 48;
        break;
      case 'landmark':
        priorityBonus = 40;
        break;
      case 'pagoda':
        priorityBonus = 35;
        break;
      case 'hospital':
        priorityBonus = 32;
        break;
      case 'school':
      case 'university':
        priorityBonus = 30;
        break;
      case 'airport':
        priorityBonus = 38;
        break;
      case 'monument':
        priorityBonus = 34;
        break;
      case 'market':
        priorityBonus = 25;
        break;
      case 'road':
        priorityBonus = 22;
        break;
      case 'street':
        priorityBonus = 15;
        break;
      case 'borey':
        priorityBonus = 10;
        break;
      default:
        priorityBonus = 0;
    }

    // Curated Landmark Priority Boost
    const isSignificant = NATIONALLY_SIGNIFICANT_LANDMARKS.some(l => {
      const normL = normalizeKhmer(l).toLowerCase().replace(/\s+/g, '');
      const candName = normalizeKhmer(c.name || '').toLowerCase().replace(/\s+/g, '');
      const candNameKh = normalizeKhmer(c.name_kh || '').toLowerCase().replace(/\s+/g, '');
      return candName === normL || candNameKh === normL || candName.includes(normL) || candNameKh.includes(normL);
    });
    if (isSignificant) {
      priorityBonus += 150; // Boost to take absolute precedence
    }

    let intentAdjustment = 0;
    if (queryIntents.length > 0) {
      intentAdjustment = isTypeCompatible(candidateType, queryIntents) ? 12 : -35;
    }

    const curatedBonus = c.source === 'famous_market' ? 4 : 0;
    const verifiedBonus = c.priorityScore >= 95 ? 3 : 0;
    
    // Entity match bonus - candidates matching extracted entities get boosted
    const entityBonus = c.entityMatchScore ? Math.min(c.entityMatchScore / 10, 15) : 0;
    
    c.finalScore = Math.min(100, c.baseScore + priorityBonus / 5 + intentAdjustment + curatedBonus + verifiedBonus + entityBonus);
    c.reason = isTypeCompatible(candidateType, queryIntents)
      ? undefined
      : `Type mismatch: query expects ${queryIntents.join(', ')}, candidate is ${candidateType}.`;
  });

  filteredCandidates.sort((a, b) => b.finalScore - a.finalScore);

  // Apply Generic Names ambiguity force check (ALWAYS ambiguous, even with 1 candidate)
  const isGeneric = isGenericName(processedQuery);
  if (isGeneric) {
    console.log(`⚠️ Generic Name ambiguity triggered for "${processedQuery}". Returning multiple candidates.`);
    if (filteredCandidates.length > 0) {
      return {
        type: 'multiple',
        results: filteredCandidates.slice(0, 5).map(formatAmbiguousCandidate)
      };
    }
    return null; // No candidates found for this generic name
  }

  // Apply Score Gap Rule (gap < 3 between top two → Ambiguous)
  if (filteredCandidates.length > 1) {
    const scoreDiff = filteredCandidates[0].finalScore - filteredCandidates[1].finalScore;
    if (scoreDiff < 3) {
      console.log(`⚠️ Score Gap Rule triggered (gap: ${scoreDiff.toFixed(2)}). Returning ambiguous candidates.`);
      return {
        type: 'multiple',
        results: filteredCandidates.slice(0, 5).map(formatAmbiguousCandidate)
      };
    }
  }

  const top = filteredCandidates[0];

  // 4. Threshold Checking (90%)
  if (top.finalScore < 90) {
    const closeMatches = filteredCandidates.filter(c => Math.abs(c.finalScore - top.finalScore) < 5);
    if (closeMatches.length > 1) {
      return {
        type: 'multiple',
        results: closeMatches.slice(0, 5).map(formatAmbiguousCandidate)
      };
    }
    return null;
  }

  // Save successful exact match to cache
  const result = {
    lat: top.latitude,
    lng: top.longitude,
    name: top.name_kh ? `${top.name_kh} (${top.name})` : top.name,
    province: top.province || '',
    province_kh: top.province_kh || '',
    district: top.district || '',
    district_kh: top.district_kh || '',
    commune: top.commune || '',
    commune_kh: top.commune_kh || '',
    village: top.village || '',
    village_kh: top.village_kh || '',
    object_type: top.objectType || top.type,
    confidence: Math.round(top.finalScore),
    matchedFields: top.matchedFields,
    reason: `Selected top candidate "${top.name}" (${top.objectType || top.type}) via matches on [${top.matchedFields.join(', ')}] with ${Math.round(top.finalScore)}% confidence.`
  };

  saveToGeocodingCache(query, result.lat, result.lng, result.name);
  return result;
}

async function queryPhoton(query, limit = 1, province = '') {
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

  const bbox = getProvinceBBox(province);

  for (const q of searchQueries) {
    try {
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&bbox=${bbox}&limit=${limit}`;
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

async function queryNominatim(query, limit = 1, province = '') {
  // 1. Try Photon first (highly reliable, no rate limits, includes our Romanization helper)
  try {
    const photonResults = await queryPhoton(query, limit, province);
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

  // Improvement #5: Enrich resolved market with NCDD codes
  if (resolvedMarket) {
    resolvedMarket = autoPick.enrichWithNcddCodes(resolvedMarket);
  }

  // Improvement #1: Compute confidence for the resolved market
  const smartFindConfidence = resolvedMarket
    ? autoPick.computeConfidence(resolvedMarket, q, province || '', null)
    : 0;

  // Improvement #6: Auto-learn this resolved location for future lookups
  autoPick.autoLearnLocation(q, resolvedMarket, coords, source);

  res.json({
    query: q,
    resolved_market: resolvedMarket,
    confidence: smartFindConfidence,
    auto_pick: smartFindConfidence >= autoPick.AUTO_PICK_THRESHOLD,
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
 * GET /api/ncdd/search
 * Search NCDD hierarchy
 */
app.get('/api/ncdd/search', (req, res) => {
  const { q = '', limit = 20 } = req.query;
  const results = searchNcdd(q, parseInt(limit));
  res.json(results);
});

/**
 * GET /api/ncdd/provinces
 * Get list of all provinces
 */
app.get('/api/ncdd/provinces', (req, res) => {
  const list = ncddHierarchy.map(p => ({ code: p.code, name_en: p.name_en, name_kh: p.name_kh }));
  res.json(list);
});

/**
 * GET /api/ncdd/districts
 * Get districts for a given province
 */
app.get('/api/ncdd/districts', (req, res) => {
  const { provinceCode } = req.query;
  if (!provinceCode) return res.status(400).json({ error: 'provinceCode is required' });
  const prov = ncddHierarchy.find(p => p.code === provinceCode);
  if (!prov) return res.status(404).json({ error: 'Province not found' });
  const list = prov.districts.map(d => ({ code: d.code, name_en: d.name_en, name_kh: d.name_kh, type: d.type }));
  res.json(list);
});

/**
 * GET /api/ncdd/communes
 * Get communes for a given district
 */
app.get('/api/ncdd/communes', (req, res) => {
  const { districtCode } = req.query;
  if (!districtCode) return res.status(400).json({ error: 'districtCode is required' });
  const provCode = districtCode.substring(0, 2);
  const prov = ncddHierarchy.find(p => p.code === provCode);
  if (!prov) return res.status(404).json({ error: 'Province not found' });
  const dist = prov.districts.find(d => d.code === districtCode);
  if (!dist) return res.status(404).json({ error: 'District not found' });
  const list = dist.communes.map(c => ({ code: c.code, name_en: c.name_en, name_kh: c.name_kh, type: c.type }));
  res.json(list);
});

/**
 * GET /api/ncdd/villages
 * Get villages for a given commune
 */
app.get('/api/ncdd/villages', (req, res) => {
  const { communeCode } = req.query;
  if (!communeCode) return res.status(400).json({ error: 'communeCode is required' });
  const provCode = communeCode.substring(0, 2);
  const distCode = communeCode.substring(0, 4);
  const prov = ncddHierarchy.find(p => p.code === provCode);
  if (!prov) return res.status(404).json({ error: 'Province not found' });
  const dist = prov.districts.find(d => d.code === distCode);
  if (!dist) return res.status(404).json({ error: 'District not found' });
  const comm = dist.communes.find(c => c.code === communeCode);
  if (!comm) return res.status(404).json({ error: 'Commune not found' });
  const list = comm.villages.map(v => ({ code: v.code, name_en: v.name_en, name_kh: v.name_kh }));
  res.json(list);
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
