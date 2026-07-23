# Cambodia Address Resolver & Route Search Engine Documentation

This document provides a complete technical explanation of how the application is structured, how the search engine works, how location matches and distances are calculated, and how branch/app auto-selection functions.

---

## 1. System Architecture Overview

The system processes raw Khmer and English natural-language addresses, extracts geographic entities, resolves official NCDD administrative divisions, calculates geographic distance to logistics pickup hubs, and routes orders to designated application dispatchers.

```
+-----------------------------------------------------------------------------------+
|                                  USER SEARCH                                      |
|            "ផ្ទះនៅជិតផ្សារទួលពង្រ ខណ្ឌពោធិ៍សែនជ័យ" / "Street 271, Depo"              |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
|                        1. REGEX CLEANING & NORMALIZATION                          |
|  - Strip Zero-Width Space (\u200B)                                                |
|  - Khmer Numerals (០-៩) -> Arabic Digits (0-9)                                    |
|  - Decomposed Vowels Correction (េី -> ើ, េា -> ោ)                                 |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
|                      2. ENTITY EXTRACTION & PARSING                               |
|  - Extract: Province, District, Commune, Village, Market, Borey, Street, Pagoda    |
|  - Strip Fillers ("ផ្ទះនៅ", "ជិត", "near", "next to")                             |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
|                      3. RESOLUTION & MATCHING ENGINE                              |
|  Priority 1: Curated Landmark / Market Exact Match                                |
|  Priority 2: Administrative Division (Province -> District -> Commune -> Village) |
|  Priority 3: Fuzzy Matching (fuzzball / RapidFuzz + Fuse.js)                       |
|  Priority 4: External Geocoding Proxy (OSM / Nominatim fallback)                  |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
|                4. HAVERSINE GEO-DISTANCE & BRANCH CALCULATOR                      |
|  - Calculate distance from matched location (lat, lng) to all pickup branches      |
|  - Find nearest pickup store code (e.g., BANA001, PNP01)                          |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
|                      5. BRANCH & APP AUTO-SELECTION                               |
|  - Map resolved branch_id -> App Config (app_branch_config.json)                  |
|  - Pre-select Delivery App, API Endpoint, & Hub Dispatch Code                     |
+-----------------------------------------------------------------------------------+
```

---

## 2. Core Data Files & Roles

| Data File | Role & Contents |
| :--- | :--- |
| **`data/ncdd_hierarchy.json`** | Official Cambodia Administrative Database (25 Provinces, 200+ Districts, 1600+ Communes, 14,000+ Villages) with codes and dual Khmer/English names. |
| **`data/pickup_branches.json`** | Master list of pickup points & hubs with `store_code`, `store_name`, `province_kh`, `district_en`, `latitude`, `longitude`, and `raw_delivery_store`. |
| **`data/routes.json`** | Mapped locations linking specific areas, markets, and communes to default logistics `branch_id`s. |
| **`data/famous_markets.json`** | Curated landmarks (markets, pagodas, hospitals, universities) with precise coordinates. |
| **`lib/entity_extractor.js`** | Natural language entity extractor using regex and landmark dictionaries. |
| **`server.js`** | Primary REST API engine hosting normalization, search resolution, fuzzy scoring, and Haversine nearest-branch lookup. |

---

## 3. How the Search Engine Works

### Step 1: Raw Input Normalization
Every input string is sanitized using `normalizeKhmer()` in `server.js`:

```javascript
function normalizeKhmer(str) {
  if (!str) return "";
  let normalized = str.normalize("NFC").toLowerCase().trim();
  normalized = normalized.replace(/\u178E\u17D2\u178F/g, "\u178E\u17D2\u178A"); // ណ+្ត -> ណ+្ដ
  normalized = normalized.replace(/\u17C1\u17B8/g, "\u17BE"); // decomposed vowel OE
  normalized = normalized.replace(/\u17C1\u17B6/g, "\u17C4"); // decomposed vowel OO
  normalized = normalized.replace(/\u200B/g, "");             // zero-width space
  normalized = convertKhmerToArabicDigits(normalized);        // ០-៩ -> 0-9
  return normalized;
}
```

### Step 2: Natural Language Entity Extraction
The engine removes location filler words (*"ផ្ទះនៅ"*, *"ជិត"*, *"ទល់មុខ"*, *"near"*, *"next to"*) and uses regex matching to pull distinct geographic units:

* **Commune/Sangkat**: Regex pattern `/សង្កាត់\s*([^\s,]+)/gi`
* **District/Khan**: Regex pattern `/ខណ្ឌ\s*([^\s,]+)/gi`
* **Market**: Regex pattern `/ផ្សារ\s*([^\s,]+)/gi`
* **Borey**: Regex pattern `/បុរី\s*([^\s,]+)/gi`

### Step 3: Hierarchical Matcher
Matches are evaluated against a strict priority cascade:
1. **Curated Landmarks**: Exact name match against `famous_markets.json`.
2. **NCDD Administrative Matches**: Matches Province $\rightarrow$ District $\rightarrow$ Commune $\rightarrow$ Village.
3. **Fuzzy String Matching**: Evaluated using **RapidFuzz / fuzzball** (`fuzz.ratio` and `fuzz.token_set_ratio`) with length penalty:
   ```javascript
   const ratio = fuzz.ratio(normalizedCand, normalizedQuery);
   const tokenSet = fuzz.token_set_ratio(normalizedCand, normalizedQuery);
   let finalScore = Math.max(ratio, tokenSet);
   ```

---

## 4. How Location Calculation & Distance Matching Work

### 1. Priority Rules
* **Exact Match Lock**: Exact landmark/administrative matches bypass fuzzy guessing.
* **No Nearby Business Override**: Landmark matches (wat, hospital, market, bridge) are never overridden by nearby retail shops.
* **Province Jumping Penalty**: Results in other provinces are penalized unless explicitly requested in the input.

### 2. Haversine Distance Formula
To find the nearest pickup branch to any matched coordinate $(lat_1, lon_1)$, the engine computes spherical distance:

$$d = 2R \cdot \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)}\right)$$

In JavaScript (`server.js`):
```javascript
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
}
```

### 3. Nearest Branch Assignment (`findNearestBranch`)
Iterates through all branches in `pickup_branches.json` filtered by province/district to locate the minimum distance branch record:

```javascript
function findNearestBranch(lat, lon, candidateBranches) {
  let closest = null;
  let minDistance = Infinity;

  for (const branch of candidateBranches) {
    const dist = haversineDistance(lat, lon, branch.latitude, branch.longitude);
    if (dist < minDistance) {
      minDistance = dist;
      closest = branch;
    }
  }

  return { branch: closest, distance_km: Math.round(minDistance * 100) / 100 };
}
```

---

## 5. How Branch & App Auto-Selection Works

Once location calculation resolves a `branch_id` (e.g., `BANA001` or `PNP01`), an application router auto-selects the corresponding operational app or delivery integration.

### Configuration (`app_branch_config.json`)
```json
{
  "BANA001": {
    "app_name": "Battambang Express App",
    "app_id": "APP_BB_01",
    "hub_code": "HUB_BANA",
    "api_endpoint": "https://api.express-bb.com/v1/orders"
  },
  "PNP01": {
    "app_name": "Phnom Penh Central App",
    "app_id": "APP_PNP_01",
    "hub_code": "HUB_PNP_MAIN",
    "api_endpoint": "https://api.express-pnp.com/v1/orders"
  }
}
```

### Flow Execution
1. Address resolved $\rightarrow$ Returns `branch_id: "BANA001"`.
2. Router reads `APP_CONFIG["BANA001"]`.
3. Pre-fills UI dropdown with `"Battambang Express App"` and attaches `HUB_BANA` to payload.

---

## 6. Mapping to Elasticsearch Khmer Analysis Plugin

To move from Node.js in-memory search to Elasticsearch:

```
[ Elasticsearch Index Settings ]
    │
    ├── Char Filter  ---> khmer_unicode_normalizer (maps ០-៩ to 0-9, strips \u200B)
    ├── Tokenizer    ---> icu_tokenizer (ICU boundary break for Khmer script)
    └── Token Filter ---> khmer_admin_prefix_remover (strips "សង្កាត់", "ខណ្ឌ", "ផ្សារ")
```

### Elasticsearch Index Configuration
```json
PUT /khmer_addresses
{
  "settings": {
    "analysis": {
      "char_filter": {
        "khmer_normalizer": {
          "type": "mapping",
          "mappings": [
            "\\u200B => ",
            "០ => 0", "១ => 1", "២ => 2", "៣ => 3", "FOUR => 4",
            "៥ => 5", "៦ => 6", "៧ => 7", "៨ => 8", "៩ => 9"
          ]
        }
      },
      "filter": {
        "admin_prefix_remover": {
          "type": "pattern_replace",
          "pattern": "^(សង្កាត់|ខណ្ឌ|ស្រុក|ឃុំ|ភូមិ|ផ្សារ|វត្ត|បុរី|ផ្លូវ)\\s*",
          "replacement": ""
        }
      },
      "analyzer": {
        "khmer_analyzer": {
          "type": "custom",
          "char_filter": ["khmer_normalizer"],
          "tokenizer": "icu_tokenizer",
          "filter": ["lowercase", "admin_prefix_remover", "icu_folding"]
        }
      }
    }
  }
}
```
