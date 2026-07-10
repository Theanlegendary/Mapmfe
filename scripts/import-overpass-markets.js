/**
 * import-overpass-markets.js
 *
 * One-time (re-runnable) importer that pulls real marketplace data from
 * OpenStreetMap via the Overpass API and merges it into data/famous_markets.json.
 *
 * Unlike Nominatim (which searches by NAME), Overpass searches by TAGS
 * (amenity=marketplace, shop=supermarket, name contains ផ្សារ), so it can
 * bulk-discover markets that a name-based geocoder would never find on its own.
 *
 * Priority order (per user request — most searched areas first):
 *   1. Phnom Penh (bounding box query — fast, most relevant)
 *   2. Rest of Cambodia (country-wide query — slower, run after PP)
 *
 * Usage:
 *   node scripts/import-overpass-markets.js            (Phnom Penh only)
 *   node scripts/import-overpass-markets.js --all       (Phnom Penh + full country)
 *
 * Safety:
 *   - Dedupes against existing routes.json + famous_markets.json (name + ~300m radius)
 *   - Never overwrites existing entries, only appends new ones
 *   - Respects Overpass's public server fair-use (single sequential requests, delays)
 *   - Writes results to famous_markets.json with confidence/source metadata
 */

const fs = require('fs');
const path = require('path');

const ROUTES_PATH = path.join(__dirname, '..', 'data', 'routes.json');
const FAMOUS_PATH = path.join(__dirname, '..', 'data', 'famous_markets.json');
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Phnom Penh bounding box (south, west, north, east) — generous margin around the city
const PHNOM_PENH_BBOX = '11.40,104.75,11.75,105.05';

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalize(str) {
  if (!str) return '';
  return str.normalize('NFC').toLowerCase().trim().replace(/\s+/g, ' ');
}

function buildQuery(bboxOrArea, isBbox) {
  const scope = isBbox ? `(${bboxOrArea})` : `(area.cambodia)`;
  const areaSetup = isBbox ? '' : `
  area["ISO3166-1"="KH"][admin_level=2]->.cambodia;`;

  return `[out:json][timeout:180];${areaSetup}
(
  node["amenity"="marketplace"]${scope};
  way["amenity"="marketplace"]${scope};
  relation["amenity"="marketplace"]${scope};

  node["shop"="supermarket"]${scope};
  way["shop"="supermarket"]${scope};
  relation["shop"="supermarket"]${scope};

  node["name"~"ផ្សារ",i]${scope};
  way["name"~"ផ្សារ",i]${scope};
  relation["name"~"ផ្សារ",i]${scope};
);
out center tags;`;
}

async function queryOverpass(query, label) {
  console.log(`\n🔎 Querying Overpass: ${label}...`);
  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'User-Agent': 'GENRoute-Mapmfe/1.0 (Cambodia market importer; contact: theanlegendary)'
      },
      body: query
    });

    if (!res.ok) {
      console.error(`❌ Overpass request failed for ${label}: HTTP ${res.status}`);
      return [];
    }

    const data = await res.json();
    const elements = data.elements || [];
    console.log(`✅ Overpass returned ${elements.length} raw elements for ${label}`);
    return elements;
  } catch (err) {
    console.error(`❌ Overpass query failed for ${label}:`, err.message);
    return [];
  }
}

function extractLatLng(el) {
  if (el.type === 'node') {
    return { lat: el.lat, lng: el.lon };
  }
  // ways/relations use the "center" field when we request "out center"
  if (el.center) {
    return { lat: el.center.lat, lng: el.center.lon };
  }
  return null;
}

function elementToMarket(el, nextId) {
  const coords = extractLatLng(el);
  if (!coords) return null;

  const tags = el.tags || {};
  const nameEn = tags['name:en'] || tags.name || '';
  const nameKh = tags['name:km'] || (/[\u1780-\u17FF]/.test(tags.name || '') ? tags.name : '') || '';

  // Skip entries with no usable name at all
  if (!nameEn && !nameKh) return null;

  return {
    id: nextId,
    market: nameEn || nameKh,
    market_kh: nameKh || '',
    aliases: [],
    province: '',
    province_kh: '',
    district: '',
    district_kh: '',
    latitude: coords.lat,
    longitude: coords.lng,
    google_maps_url: `https://www.google.com/maps?q=${coords.lat},${coords.lng}`,
    source: 'overpass_osm',
    source_id: `${el.type}/${el.id}`,
    confidence: 70,
    is_verified: false
  };
}

async function main() {
  const importAll = process.argv.includes('--all');

  console.log('📦 Loading existing databases for dedup...');
  const routes = JSON.parse(fs.readFileSync(ROUTES_PATH, 'utf-8'));
  const famousMarkets = JSON.parse(fs.readFileSync(FAMOUS_PATH, 'utf-8'));

  const existingForDedup = [...routes, ...famousMarkets].map(r => ({
    name: normalize(r.market || r.market_kh || ''),
    lat: r.latitude,
    lng: r.longitude
  })).filter(r => r.name && r.lat && r.lng);

  console.log(`   Existing entries for dedup: ${existingForDedup.length}`);

  let nextId = Math.max(
    ...famousMarkets.map(m => parseInt(m.id) || 0),
    9000
  ) + 1;

  const allNewEntries = [];
  const seenInThisRun = new Set();

  function isDuplicate(name, lat, lng) {
    const normName = normalize(name);
    if (seenInThisRun.has(`${normName}|${lat.toFixed(3)}|${lng.toFixed(3)}`)) return true;

    return existingForDedup.some(e => {
      if (e.name !== normName) return false;
      return haversine(lat, lng, e.lat, e.lng) < 0.3; // within 300m + same name = duplicate
    });
  }

  // ── STEP 1: Phnom Penh first (highest priority — most searched area) ──
  const ppQuery = buildQuery(PHNOM_PENH_BBOX, true);
  const ppElements = await queryOverpass(ppQuery, 'Phnom Penh (priority)');

  let ppAdded = 0;
  for (const el of ppElements) {
    const market = elementToMarket(el, nextId);
    if (!market) continue;
    if (isDuplicate(market.market, market.latitude, market.longitude)) continue;

    market.province = 'Phnom Penh';
    market.province_kh = 'ភ្នំពេញ';
    seenInThisRun.add(`${normalize(market.market)}|${market.latitude.toFixed(3)}|${market.longitude.toFixed(3)}`);
    allNewEntries.push(market);
    nextId++;
    ppAdded++;
  }
  console.log(`✅ Phnom Penh: ${ppAdded} new markets added (${ppElements.length - ppAdded} were duplicates/skipped)`);

  // ── STEP 2: Rest of Cambodia (only if --all flag passed) ──
  if (importAll) {
    // Wait a bit to respect Overpass fair-use policy between big queries
    console.log('\n⏳ Waiting 5s before nationwide query (Overpass fair-use)...');
    await new Promise(r => setTimeout(r, 5000));

    const countryQuery = buildQuery(null, false);
    const countryElements = await queryOverpass(countryQuery, 'Full Cambodia');

    let countryAdded = 0;
    for (const el of countryElements) {
      const market = elementToMarket(el, nextId);
      if (!market) continue;
      if (isDuplicate(market.market, market.latitude, market.longitude)) continue;

      seenInThisRun.add(`${normalize(market.market)}|${market.latitude.toFixed(3)}|${market.longitude.toFixed(3)}`);
      allNewEntries.push(market);
      nextId++;
      countryAdded++;
    }
    console.log(`✅ Rest of Cambodia: ${countryAdded} new markets added (${countryElements.length - countryAdded} were duplicates/skipped)`);
  } else {
    console.log('\nℹ️  Skipping nationwide import (run with --all flag to include the rest of Cambodia)');
  }

  if (allNewEntries.length === 0) {
    console.log('\n✨ No new markets to add. Database is already up to date.');
    return;
  }

  // ── Merge & save ──
  const updatedFamousMarkets = [...famousMarkets, ...allNewEntries];
  fs.writeFileSync(FAMOUS_PATH, JSON.stringify(updatedFamousMarkets, null, 2), 'utf-8');

  console.log(`\n💾 Saved! Added ${allNewEntries.length} new markets to famous_markets.json`);
  console.log(`   Total famous_markets.json entries now: ${updatedFamousMarkets.length}`);
  console.log('\n📋 Sample of newly added markets:');
  allNewEntries.slice(0, 10).forEach(m => {
    console.log(`   - ${m.market}${m.market_kh ? ' (' + m.market_kh + ')' : ''} @ ${m.latitude.toFixed(4)}, ${m.longitude.toFixed(4)}`);
  });
}

main().catch(err => {
  console.error('❌ Import script failed:', err);
  process.exit(1);
});
