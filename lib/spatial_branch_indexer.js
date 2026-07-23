/**
 * ============================================================
 * SPATIAL BRANCH INDEXER — 12km Auto-Select & Related Keywords
 * ============================================================
 * Given any location coordinates (lat, lng) or market entity:
 * 1. Computes Haversine distance to all 650 pickup branches.
 * 2. Filters branches within max 12.0 km.
 * 3. Auto-selects the nearest branch (#1 closest within 12km).
 * 4. Given any branch ID/code, retrieves all related search keywords
 *    and location items under 12km radius.
 * ============================================================
 */

'use strict';

const DEFAULT_MAX_DIST_KM = 12.0;

/**
 * Haversine formula to compute distance in km between two lat/lng pairs
 */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Find all pickup branches within maxDistKm (default 12km) for given coordinates
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {Array} branchesList - Array of pickup branch objects with latitude/longitude
 * @param {number} maxDistKm - Max distance in km (default 12.0)
 * @returns {{ auto_selected_branch: Object|null, nearby_branches_12km: Array, total_nearby: number }}
 */
function findNearbyBranches(lat, lng, branchesList = [], maxDistKm = DEFAULT_MAX_DIST_KM) {
  if (!lat || !lng || !Array.isArray(branchesList) || branchesList.length === 0) {
    return {
      auto_selected_branch: null,
      nearby_branches_12km: [],
      total_nearby: 0
    };
  }

  const numericLat = parseFloat(lat);
  const numericLng = parseFloat(lng);

  if (isNaN(numericLat) || isNaN(numericLng)) {
    return {
      auto_selected_branch: null,
      nearby_branches_12km: [],
      total_nearby: 0
    };
  }

  const scored = [];

  for (const b of branchesList) {
    if (b.latitude && b.longitude) {
      const bLat = parseFloat(b.latitude);
      const bLng = parseFloat(b.longitude);
      if (!isNaN(bLat) && !isNaN(bLng)) {
        const dist = haversine(numericLat, numericLng, bLat, bLng);
        if (dist <= maxDistKm) {
          scored.push({
            id: `po_${b.store_code}`,
            store_code: b.store_code,
            store_name: b.store_name,
            province_kh: b.province_kh || '',
            district_en: b.district_en || '',
            district_kh: b.district_kh || '',
            latitude: bLat,
            longitude: bLng,
            raw_delivery_store: b.raw_delivery_store || `${b.store_code} - ${b.store_name}`,
            google_maps_url: `https://www.google.com/maps?q=${bLat},${bLng}`,
            distance_km: parseFloat(dist.toFixed(2))
          });
        }
      }
    }
  }

  // Sort by distance ascending (nearest first)
  scored.sort((a, b) => a.distance_km - b.distance_km);

  const autoSelected = scored.length > 0 ? scored[0] : null;

  return {
    auto_selected_branch: autoSelected,
    nearby_branches_12km: scored,
    nearby_branches_10km: scored.filter(b => b.distance_km <= 10.0),
    total_nearby: scored.length
  };
}

/**
 * Enriches a location record (market, landmark, route) with its 12km auto-selected branch
 * @param {Object} locationRecord - Record containing latitude and longitude
 * @param {Array} branchesList - Array of pickup branches
 * @param {number} maxDistKm - Max radius in km (default 12.0)
 * @returns {Object} Enriched record with auto_selected_branch and nearby_branches_12km
 */
function enrichLocationWith12kmBranch(locationRecord, branchesList = [], maxDistKm = DEFAULT_MAX_DIST_KM) {
  if (!locationRecord) return locationRecord;

  const enriched = { ...locationRecord };

  if (enriched.latitude && enriched.longitude) {
    const { auto_selected_branch, nearby_branches_12km, total_nearby } = findNearbyBranches(
      enriched.latitude,
      enriched.longitude,
      branchesList,
      maxDistKm
    );

    enriched.auto_selected_branch = auto_selected_branch;
    enriched.nearby_branches_12km = nearby_branches_12km;
    enriched.nearby_branches_10km = nearby_branches_12km.filter(b => b.distance_km <= 10.0);
    enriched.total_nearby_branches_12km = total_nearby;

    // Set branch_id to auto-selected branch store_code if available
    if (auto_selected_branch && auto_selected_branch.store_code) {
      enriched.assigned_12km_branch_id = auto_selected_branch.store_code;
    }
  }

  return enriched;
}

/**
 * Given a branch ID/code, retrieves all locations, markets, and keywords within 12km
 * @param {string} branchCode - Store code or ID of the branch (e.g. "PNPA060")
 * @param {Array} allLocationsList - Array of all market/location objects
 * @param {Array} branchesList - Array of pickup branch objects
 * @param {number} maxDistKm - Max distance in km (default 12.0)
 * @returns {{ branch: Object|null, total_locations_under_12km: number, related_locations_12km: Array, search_keywords_12km: Array }}
 */
function findLocationsForBranch(branchCode, allLocationsList = [], branchesList = [], maxDistKm = DEFAULT_MAX_DIST_KM) {
  if (!branchCode) {
    return { branch: null, total_locations_under_12km: 0, related_locations_12km: [], search_keywords_12km: [] };
  }

  const cleanCode = branchCode.trim().toLowerCase().replace(/^po_/, '');
  const branch = branchesList.find(b => b.store_code.toLowerCase() === cleanCode);

  if (!branch || !branch.latitude || !branch.longitude) {
    return { branch: branch || null, total_locations_under_12km: 0, related_locations_12km: [], search_keywords_12km: [] };
  }

  const bLat = parseFloat(branch.latitude);
  const bLng = parseFloat(branch.longitude);

  const matchedLocations = [];
  const keywordSet = new Set();

  for (const loc of allLocationsList) {
    if (loc.latitude && loc.longitude) {
      const lLat = parseFloat(loc.latitude);
      const lLng = parseFloat(loc.longitude);
      if (!isNaN(lLat) && !isNaN(lLng)) {
        const dist = haversine(bLat, bLng, lLat, lLng);
        if (dist <= maxDistKm) {
          const locNameEn = loc.market || loc.name || '';
          const locNameKh = loc.market_kh || loc.name_kh || '';

          if (locNameEn) keywordSet.add(locNameEn.trim());
          if (locNameKh) keywordSet.add(locNameKh.trim());
          if (loc.district) keywordSet.add(loc.district.trim());
          if (loc.district_kh) keywordSet.add(loc.district_kh.trim());
          if (loc.commune_kh) keywordSet.add(loc.commune_kh.trim());
          if (loc.aliases && Array.isArray(loc.aliases)) {
            loc.aliases.forEach(a => a && keywordSet.add(a.trim()));
          }

          matchedLocations.push({
            id: loc.id || loc.code || '',
            market: locNameEn,
            market_kh: locNameKh,
            province_kh: loc.province_kh || loc.province || '',
            district_en: loc.district || '',
            district_kh: loc.district_kh || '',
            commune_kh: loc.commune_kh || '',
            latitude: lLat,
            longitude: lLng,
            distance_km: parseFloat(dist.toFixed(2))
          });
        }
      }
    }
  }

  matchedLocations.sort((a, b) => a.distance_km - b.distance_km);

  return {
    branch: {
      store_code: branch.store_code,
      store_name: branch.store_name,
      province_kh: branch.province_kh || '',
      district_en: branch.district_en || '',
      district_kh: branch.district_kh || '',
      latitude: bLat,
      longitude: bLng
    },
    total_locations_under_12km: matchedLocations.length,
    related_locations_12km: matchedLocations,
    search_keywords_12km: Array.from(keywordSet).filter(k => k.length >= 2)
  };
}

module.exports = {
  DEFAULT_MAX_DIST_KM,
  haversine,
  findNearbyBranches,
  enrichLocationWith12kmBranch,
  enrichLocationWith10kmBranch: enrichLocationWith12kmBranch, // backwards compatibility alias
  findLocationsForBranch
};
