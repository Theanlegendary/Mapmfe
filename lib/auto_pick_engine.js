/**
 * ============================================================
 * AUTO-PICK ENGINE — 6 improvements for accurate auto-selection
 * ============================================================
 *
 * 1. Confidence Scorer         — auto-pick if score >= 85
 * 2. Khmer Phoneme Normalizer  — handles zero-width chars
 * 3. Province-Scoped Filter    — integrated into /api/search
 * 4. Phonetic Romanization     — phsar thmei → ផ្សារធំថ្មី
 * 5. NCDD Commune Enrichment   — fills commune_id from NCDD
 * 6. Auto-Learning Cache       — saves resolved locations
 * ============================================================
 *
 * Usage in server.js:
 *   const autoPick = require('./lib/auto_pick_engine');
 *   autoPick.init({ flatNcddList, stripAdministrativePrefixes });
 *   const scored = autoPick.scoreAndAutoPick(results, q, province);
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const AUTO_PICK_THRESHOLD = 85;

// ── Improvement 2: Enhanced Khmer Normalizer ──────────────────────
function normalizeKhmerEnhanced(str) {
  if (!str) return '';
  let s = str.normalize('NFC').toLowerCase().trim();
  s = s.replace(/\u200B|\u200C|\u200D|\uFEFF/g, '');  // all zero-width chars
  s = s.replace(/\u17C1\u17B8/g, '\u17BE');            // េី → ើ
  s = s.replace(/\u17C1\u17B6/g, '\u17C4');            // េា → ោ
  // Khmer digits → Arabic
  s = s.replace(/[០-៩]/g, d => String.fromCharCode(d.charCodeAt(0) - 0x17E0 + 48));
  return s;
}

// ── Improvement 4: Phonetic Romanization Index ────────────────────
const PHONETIC_ROMANIZATION_INDEX = {
  // Famous Phnom Penh markets
  'phsar thmei': 'ផ្សារធំថ្មី',
  'phsar thmai': 'ផ្សារធំថ្មី',
  'central market': 'ផ្សារធំថ្មី',
  'psar thmey': 'ផ្សារធំថ្មី',
  'psar thmai': 'ផ្សារធំថ្មី',
  'psarnat': 'ផ្សារធំថ្មី',
  'psar nat': 'ផ្សារធំថ្មី',
  'pshar thmei': 'ផ្សារធំថ្មី',
  'russei keo': 'ផ្សារឫស្សីកែវ',
  'russey keo': 'ផ្សារឫស្សីកែវ',
  'phsar russei keo': 'ផ្សារឫស្សីកែវ',
  'tuol tompung': 'ផ្សារទួលទំពូង',
  'tuol tom poung': 'ផ្សារទួលទំពូង',
  'russian market': 'ផ្សារទួលទំពូង',
  'toul tom poung': 'ផ្សារទួលទំពូង',
  'olympic market': 'ផ្សារអូឡាំពិក',
  'phsar olympic': 'ផ្សារអូឡាំពិក',
  'orussey market': 'ផ្សារអូរឫស្សី',
  'phsar orussey': 'ផ្សារអូរឫស្សី',
  'psar orusey': 'ផ្សារអូរឫស្សី',
  'phsar chas': 'ផ្សារចាស់',
  'psar chas': 'ផ្សារចាស់',
  'old market': 'ផ្សារចាស់',
  'phsar kandal': 'ផ្សារកណ្ដាល',
  'phsar leu': 'ផ្សារលើ',
  'phsar leur': 'ផ្សារលើ',
  'phsar depo': 'ផ្សារដេប៉ូ',
  'depo market': 'ផ្សារដេប៉ូ',
  'phsar boeung kok': 'ផ្សារបឹងកក់',
  'boeung kok market': 'ផ្សារបឹងកក់',
  'phsar tuol sangke': 'ផ្សារទួលសង្កែ',
  'tuol sangke market': 'ផ្សារទួលសង្កែ',
  'night market': 'ផ្សាររាត្រី',
  'phsar reatrei': 'ផ្សាររាត្រី',
  'angkor night market': 'ផ្សាររាត្រីអង្គរ',
  'angkor market': 'ផ្សារអង្គរ',
  'phsar leu thom thmey': 'ផ្សារលើធំថ្មី',
  'phsar siem reap': 'ផ្សារសៀមរាប',
  'phsar kratie': 'ផ្សារក្រចេះ',
  'kratie market': 'ផ្សារក្រចេះ',
  'phsar kampong thom': 'ផ្សារកំពង់ធំ',
  'phsar battambang': 'ផ្សារបាត់ដំបង',
  'battambang market': 'ផ្សារបាត់ដំបង',
  'phsar takeo': 'ផ្សារតាកែវ',
  'phsar kampot': 'ផ្សារកំពត',
  'phsar kep': 'ផ្សារកែប',
  'phsar svay rieng': 'ផ្សារស្វាយរៀង',
  'phsar pursat': 'ផ្សារពោធិ៍សាត់',
  'phsar kompong cham': 'ផ្សារកំពង់ចាម',
  'phsar kompong chhnang': 'ផ្សារកំពង់ឆ្នាំង',
  'phsar serey sophon': 'ផ្សារសិរីសោភ័ណ',
  'serey sophon market': 'ផ្សារសិរីសោភ័ណ',
  'thai huot': 'ផ្សារថៃហួត',
  'chip mong': 'ផ្សារទំនើបជីបម៉ុង',
  'lucky supermarket': 'ផ្សារទំនើបឡាក់គី',
  'phsar neak loeung': 'ផ្សារអ្នកលឿង',
  'neak leung market': 'ផ្សារអ្នកលឿង',
  'phsar prey veng': 'ផ្សារព្រៃវែង',
  'prey veng market': 'ផ្សារព្រៃវែង',
};

/**
 * Try to match query against phonetic romanization index.
 * Returns Khmer market name string if matched, or null.
 */
function lookupPhoneticIndex(query) {
  if (!query) return null;
  const q = query.toLowerCase().trim()
    .replace(/\bpshar\b/g, 'phsar')
    .replace(/\bpsar\b/g, 'phsar');

  // Exact lookup
  if (PHONETIC_ROMANIZATION_INDEX[q]) return PHONETIC_ROMANIZATION_INDEX[q];

  // Partial: query contains a known key
  for (const [key, val] of Object.entries(PHONETIC_ROMANIZATION_INDEX)) {
    if (q === key) return val;
    if (q.includes(key) && key.length >= 6) return val;
  }

  return null;
}

// ── Internal state (injected via init()) ─────────────────────────
let _flatNcddList = [];
let _stripAdministrativePrefixes = (s) => s;

/**
 * Must call init() once after server loads flatNcddList.
 */
function init({ flatNcddList, stripAdministrativePrefixes }) {
  _flatNcddList = flatNcddList || [];
  _stripAdministrativePrefixes = stripAdministrativePrefixes || ((s) => s);
}

// ── Improvement 5: NCDD Commune Enricher ─────────────────────────
function enrichWithNcddCodes(market) {
  if (!market) return market;
  const enriched = { ...market };
  if (enriched.commune_code && enriched.district_code) return enriched;

  if (_flatNcddList.length === 0) return enriched;

  const districtKh  = normalizeKhmerEnhanced(enriched.district_kh  || enriched.district  || '');
  const communeKh   = normalizeKhmerEnhanced(enriched.commune_kh   || enriched.commune   || '');
  const provinceKh  = normalizeKhmerEnhanced(enriched.province_kh  || enriched.province  || '');

  if (!districtKh && !communeKh) return enriched;

  let bestMatch = null;
  let bestScore = 0;

  for (const item of _flatNcddList) {
    if (item.type !== 'commune') continue;
    const itemProv = normalizeKhmerEnhanced(item.province_kh || '');
    const itemDist = normalizeKhmerEnhanced(item.district_kh || '');
    const itemComm = normalizeKhmerEnhanced(item.commune_kh  || '');

    if (provinceKh && itemProv && !itemProv.includes(provinceKh) && !provinceKh.includes(itemProv)) continue;

    let score = 0;
    if (districtKh && itemDist && (itemDist.includes(districtKh) || districtKh.includes(itemDist))) score += 40;
    if (communeKh  && itemComm && (itemComm.includes(communeKh)  || communeKh.includes(itemComm)))  score += 60;

    if (score > bestScore) { bestScore = score; bestMatch = item; }
  }

  if (bestMatch && bestScore >= 40) {
    enriched.commune_code     = bestMatch.code            || '';
    enriched.district_code    = bestMatch.district_code   || '';
    enriched.province_code    = bestMatch.province_code   || '';
    enriched.commune_en_ncdd  = bestMatch.commune_en      || bestMatch.name_en || '';
    enriched.commune_kh_ncdd  = bestMatch.commune_kh      || bestMatch.name_kh || '';
  }

  return enriched;
}

// ── Improvement 1: Confidence Scorer ─────────────────────────────
function computeConfidence(result, query, province = '', fuseScore = null) {
  if (!result || !query) return 0;

  const normQ          = normalizeKhmerEnhanced(query);
  const normMarketEn   = normalizeKhmerEnhanced(result.market     || '');
  const normMarketKh   = normalizeKhmerEnhanced(result.market_kh  || '');
  const normProvResult = normalizeKhmerEnhanced(result.province_kh || result.province || '');
  const normProvQuery  = normalizeKhmerEnhanced(province || '');

  let score = 0;

  // ── Khmer name match ──
  if (normMarketKh && normQ) {
    if (normMarketKh === normQ)                                          score += 55;
    else if (normMarketKh.includes(normQ))                               score += 40;
    else if (normQ.includes(normMarketKh) && normMarketKh.length >= 4)  score += 35;
  }

  // ── English name match ──
  if (normMarketEn && normQ) {
    if (normMarketEn === normQ)                                          score += 45;
    else if (normMarketEn.includes(normQ))                               score += 30;
    else if (normQ.includes(normMarketEn) && normMarketEn.length >= 4)  score += 25;
  }

  // ── Stripped-prefix match (ផ្សារ removal) ──
  const strippedQ    = _stripAdministrativePrefixes(normQ);
  const strippedKh   = _stripAdministrativePrefixes(normMarketKh);
  const strippedEn   = _stripAdministrativePrefixes(normMarketEn);
  if (strippedQ && score < 40) {
    if (strippedKh && strippedKh.includes(strippedQ)) score += 30;
    if (strippedEn && strippedEn.includes(strippedQ)) score += 25;
  }

  // ── Alias / keyword bonus ──
  if (result.aliases && Array.isArray(result.aliases)) {
    if (result.aliases.some(a => normalizeKhmerEnhanced(a).includes(normQ))) score += 15;
  }
  if (result.search_keywords && Array.isArray(result.search_keywords)) {
    if (result.search_keywords.some(k => normalizeKhmerEnhanced(k).includes(normQ))) score += 10;
  }

  // ── Province match / penalty ──
  if (normProvQuery && normProvResult) {
    if (normProvResult.includes(normProvQuery) || normProvQuery.includes(normProvResult)) {
      score += 15;
    } else {
      score -= 20;  // Wrong province is a strong negative signal
    }
  }

  // ── Fuse.js score bonus (0 = perfect, 1 = worst) ──
  if (fuseScore !== null && fuseScore !== undefined) {
    score += Math.round((1 - fuseScore) * 20);
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Score all results and apply auto-pick logic.
 * @returns {{ results_with_confidence, auto_pick, auto_pick_result }}
 */
function scoreAndAutoPick(results, query, province = '', fuseScoreMap = {}) {
  if (!results || results.length === 0) {
    return { results_with_confidence: [], auto_pick: false, auto_pick_result: null };
  }

  const scored = results.map(r => {
    const key = `${r.market || ''}||${r.market_kh || ''}`;
    const fuseScore = fuseScoreMap[key] !== undefined ? fuseScoreMap[key] : null;
    const confidence = computeConfidence(r, query, province, fuseScore);
    return { ...enrichWithNcddCodes(r), confidence };
  });

  scored.sort((a, b) => b.confidence - a.confidence);

  // Disambiguation penalty: if top two are very close, nobody wins clearly
  if (scored.length >= 2 && (scored[0].confidence - scored[1].confidence) < 10) {
    scored[0].confidence = Math.max(0, scored[0].confidence - 15);
    scored[0].ambiguous  = true;
  }

  const top       = scored[0];
  const auto_pick = top.confidence >= AUTO_PICK_THRESHOLD;

  return {
    results_with_confidence: scored,
    auto_pick,
    auto_pick_result: auto_pick ? top : null
  };
}

// ── Improvement 6: Auto-Learning Cache ───────────────────────────
const LEARNED_AUTO_PATH = path.join(__dirname, '..', 'data', 'auto_learned_locations.json');
let autoLearnedLocations = {};

try {
  if (fs.existsSync(LEARNED_AUTO_PATH)) {
    autoLearnedLocations = JSON.parse(fs.readFileSync(LEARNED_AUTO_PATH, 'utf-8'));
  } else {
    fs.writeFileSync(LEARNED_AUTO_PATH, '{}', 'utf-8');
  }
} catch (e) {
  autoLearnedLocations = {};
}

function autoLearnLocation(query, resolvedMarket, coords, source) {
  if (!query || !coords || !coords.lat || !coords.lng) return;
  const key = normalizeKhmerEnhanced(query.trim());
  if (!key || key.length < 2) return;

  // Only learn from reliable sources
  const reliable = ['google_geocoding', 'local_db_exact', 'local_db_fuzzy'];
  if (!reliable.includes(source)) return;

  // Don't overwrite high-confidence entries
  if (autoLearnedLocations[key] && autoLearnedLocations[key].confidence >= 90) return;

  autoLearnedLocations[key] = {
    query      : query.trim(),
    market     : resolvedMarket ? (resolvedMarket.market    || query.trim()) : query.trim(),
    market_kh  : resolvedMarket ? (resolvedMarket.market_kh || '')           : '',
    province_kh: resolvedMarket ? (resolvedMarket.province_kh || '')         : '',
    district_kh: resolvedMarket ? (resolvedMarket.district_kh || '')         : '',
    latitude   : coords.lat,
    longitude  : coords.lng,
    source,
    confidence : source === 'google_geocoding' ? 88 : 95,
    learned_at : new Date().toISOString()
  };

  setImmediate(() => {
    try { fs.writeFileSync(LEARNED_AUTO_PATH, JSON.stringify(autoLearnedLocations, null, 2), 'utf-8'); }
    catch (e) { /* silent — don't crash the request */ }
  });
}

function lookupAutoLearned(query, province = '') {
  if (!query) return null;
  const key   = normalizeKhmerEnhanced(query.trim());
  const entry = autoLearnedLocations[key];
  if (!entry) return null;

  if (province) {
    const normProv  = normalizeKhmerEnhanced(province);
    const entryProv = normalizeKhmerEnhanced(entry.province_kh || '');
    if (entryProv && !entryProv.includes(normProv) && !normProv.includes(entryProv)) return null;
  }

  return entry;
}

// ── Exports ───────────────────────────────────────────────────────
module.exports = {
  AUTO_PICK_THRESHOLD,
  PHONETIC_ROMANIZATION_INDEX,
  init,
  normalizeKhmerEnhanced,
  lookupPhoneticIndex,
  enrichWithNcddCodes,
  computeConfidence,
  scoreAndAutoPick,
  autoLearnLocation,
  lookupAutoLearned,
};
