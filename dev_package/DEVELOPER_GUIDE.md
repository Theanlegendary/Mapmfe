# 🗺️ GenRoute — Developer Package

> **For developers only.** This folder contains everything you need to understand, run, and extend the GenRoute Cambodia Address Resolution System.

---

## 📦 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Create .env file (copy from this folder)
cp dev_package/.env.example .env

# 3. Start the server
node server.js
# or with auto-restart
npx nodemon server.js

# Server will run at: http://localhost:3000
```

---

## 📁 Key Source Files

| File | Purpose |
|---|---|
| [`server.js`](../server.js) | Main Express server — all API routes, data loading, search logic |
| [`lib/auto_pick_engine.js`](../lib/auto_pick_engine.js) | Auto-pick engine — confidence scoring, variant learning, NCDD enrichment |
| [`lib/entity_extractor.js`](../lib/entity_extractor.js) | NLP entity extractor — detects market/district/commune from raw text |
| [`public/pastemaster.html`](../public/pastemaster.html) | Main UI — Paste Master address resolution tool |
| [`public/`](../public/) | All frontend HTML/CSS/JS files |

---

## 🗄️ Data Files (in `data/`)

| File | Description | Size |
|---|---|---|
| `routes.json` | 894 markets with GPS coords, province/district/commune hierarchy | ~500KB |
| `famous_markets.json` | 689 curated famous markets with coordinates | ~440KB |
| `curated_landmarks.json` | 118 curated landmarks (pagodas, bridges, hospitals) | ~110KB |
| `pickup_branches.json` | 650 Post Office pickup branches (delivery network) | ~190KB |
| `ncdd_hierarchy.json` | Full Cambodia NCDD hierarchy (25 prov → district → commune → village) | ~2.7MB |
| `geocoding_cache.json` | Cache of Google Geocoding results | grows |
| `auto_learned_locations.json` | Auto-learned geocoded locations | grows |
| `learned_variants.json` | Learned misspellings → canonical market mappings | grows |
| `all_markets_mapped_fixed.csv` | All 1,232 verified markets export (EN + KH names) | |

---

## 🔌 API Endpoints

### Search

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/search?q=&type=market&province=` | Search markets or pickup branches. Returns `auto_pick` + `confidence` |
| `GET` | `/api/auto-pick?q=&province=&district=` | **Best single result** with confidence score. `auto_pick: true` = resolved instantly |
| `GET` | `/api/smart-find?q=&province=` | Full resolution: Google Geocoding → Local DB → Nearest Branch |

### Auto-Pick & Learning

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/confirm-pick` | User confirms a pick → saved as high-confidence variant for next time |
| `GET` | `/api/variants` | View all learned misspelling → canonical market mappings |

### NCDD Hierarchy

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/ncdd/search?q=` | Search provinces/districts/communes |
| `GET` | `/api/ncdd/provinces` | List all 25 provinces |
| `GET` | `/api/ncdd/districts?province_code=` | Districts for a province |
| `GET` | `/api/ncdd/communes?district_code=` | Communes for a district |

### Branches

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/branches` | All pickup branches |
| `GET` | `/api/branch/:id` | Single branch by ID |
| `GET` | `/api/nearby?lat=&lng=&max_dist=` | Nearest pickup branch to coordinates |

---

## 🧠 Auto-Pick Logic (How It Works)

```
User types query
       │
       ▼
[1] Check learned_variants.json  ← instant if previously learned
       │ (miss)
       ▼
[2] Phonetic romanization lookup  ← "phsar thmei" → ផ្សារធំថ្មី
       │ (miss)
       ▼
[3] Province-scoped substring match (exact)
       │
       ▼
[4] Fuse.js fuzzy search (with score capture)
       │
       ▼
[5] Levenshtein spelling correction (last resort)
       │
       ▼
[6] Confidence Scorer (0–100)
       │
       ├── score ≥ 85 → AUTO-PICK ✅ (auto_pick: true)
       │
       ├── score 60–84 → Save as VARIANT for next time 📚
       │                  Show dropdown to user
       │
       └── score < 60 → Show dropdown, no learning
```

### Confidence Scoring Formula

| Signal | Points |
|---|---|
| Exact Khmer name match | +55 |
| Exact English name match | +45 |
| Khmer name contains query | +40 |
| English name contains query | +30 |
| Stripped-prefix match (no ផ្សារ) | +25-30 |
| Alias / keyword match | +10-15 |
| Province match bonus | +15 |
| Province mismatch **penalty** | -20 |
| Fuse.js score bonus | up to +20 |
| Disambiguation penalty (too close) | -15 |

**Threshold: 85 points = auto-pick**

---

## 🔧 Environment Variables

Copy `.env.example` to `.env` and fill in:

```env
GEMINI_API_KEY=your_key_here       # For AI geocoding fallback (optional)
GOOGLE_MAPS_API_KEY=your_key_here  # For Google Geocoding (recommended)
PORT=3000                           # Default: 3000
```

---

## 📡 Integration Example (Frontend)

```javascript
// Auto-pick a market from user input
async function resolveMarket(userInput, province = '') {
  const res = await fetch(`/api/auto-pick?q=${encodeURIComponent(userInput)}&province=${encodeURIComponent(province)}`);
  const data = await res.json();

  if (data.auto_pick) {
    // ✅ Resolved automatically
    console.log('Auto-picked:', data.auto_pick_result.market);
    console.log('Confidence:', data.auto_pick_result.confidence);
    fillForm(data.auto_pick_result);
  } else {
    // Show dropdown with ranked candidates
    showDropdown(data.candidates);
  }
}

// When user picks from dropdown, teach the system
async function confirmUserPick(originalQuery, pickedResult) {
  await fetch('/api/confirm-pick', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: originalQuery,
      market: pickedResult.market,
      market_kh: pickedResult.market_kh,
      province_kh: pickedResult.province_kh,
      branch_id: pickedResult.branch_id,
      latitude: pickedResult.latitude,
      longitude: pickedResult.longitude
    })
  });
  // Next time the same misspelling is typed, it auto-picks ✅
}
```

---

## 🌱 How the Learning System Grows

1. **Phonetic Index** (static) — 50+ manual entries for common romanizations
2. **Fuzzy Variant Learning** (automatic) — mid-confidence matches (60–84) are auto-saved
3. **User-Confirmed Learning** (highest quality) — when user picks from dropdown, saved with 95% confidence
4. **Geocoding Cache** — Google Maps results cached in `geocoding_cache.json`
5. **Auto-Learned Locations** — saves any resolved location via `/api/smart-find`

---

## 🏗️ Architecture

```
server.js
├── Data Loading (startup)
│   ├── routes.json          → routes[]
│   ├── famous_markets.json  → famousMarkets[] → merged into routes[]
│   ├── pickup_branches.json → pickupBranches[]
│   └── ncdd_hierarchy.json  → flatNcddList[]
│
├── Search Pipeline
│   ├── preprocessSpelling()     — fixes "psar" → "phsar"
│   ├── matchesQuery()           — substring match
│   ├── Fuse.js fuzzy search     — scored results
│   └── findLevenshteinMatches() — spelling correction
│
├── lib/auto_pick_engine.js
│   ├── lookupVariant()          — learned misspellings
│   ├── lookupPhoneticIndex()    — romanization index
│   ├── scoreAndAutoPick()       — confidence + auto-pick
│   ├── enrichWithNcddCodes()    — adds commune_code from NCDD
│   ├── learnVariant()           — saves new variants
│   └── autoLearnLocation()      — saves geocoded locations
│
└── lib/entity_extractor.js
    ├── extractEntities()        — NLP market/commune/district detection
    ├── getPrimaryEntity()       — best entity from text
    └── scoreCandidatesByEntities() — rank by entity match
```

---

## 📊 Scripts

| Script | Description |
|---|---|
| `scripts/fix_user_markets.js` | Generate `all_markets_mapped_fixed.csv` from routes.json |
| `npm start` | Start server |
| `npx nodemon server.js` | Start with auto-restart |

---

*Last updated: 2026-07-23 — GenRoute Cambodia Address Engine v2.0*
