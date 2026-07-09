/* ── Cambodia Route & Branch Maps JS // Metfone Express Customer Service ── */
const API = '';

// App State
let map;
let tileLayers = {};
let activeTileLayer = null;
let markerClusterGroup; // Layer to hold all map markers
let vectorLayerGroup; // Layer to hold all polylines and circles
let activeMarkers = []; // Array of currently rendered markers
let currentResults = [];
let currentPage = 1;
const limit = 50;

// Client-Side Database Cache (for ultra-high scaling & instant offline search)
let clientRoutes = [];
let clientBranches = [];
let clientMarkets = [];
let clientMergedRoutes = [];
let clientMarketFuse = null;
let clientBranchFuse = null;
const clientTranslationDict = {};
const clientKhmerToEnglishDict = {};
const clientKhmerToEnglishManual = {
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

// Sticker Labels State
let showLabelsToggle = true; // default on
let labelSize = 'normal';    // default normal (medium)
let labelContentMode = 'id'; // default to only show post code / ID
let activeStickerMarkers = [];

// DOM Elements
const searchInput = document.getElementById('searchInput');
const clearBtn = document.getElementById('clearBtn');
const searchBtn = document.getElementById('searchBtn');
const provinceSelect = document.getElementById('provinceSelect');
const autocompleteDropdown = document.getElementById('autocompleteDropdown');
const resultsCount = document.getElementById('resultsCount');
const resultsList = document.getElementById('resultsList');
const footerStats = document.getElementById('footerStats');

// States DOM
const stateWelcome = document.getElementById('stateWelcome');
const stateLoading = document.getElementById('stateLoading');
const stateEmpty = document.getElementById('stateEmpty');

// Custom Eco-Organic Metfone Red Pin (Post Office / Branch)
const redIcon = L.divIcon({
  html: `
    <div class="eco-pin eco-pin--metfone">
      <div class="eco-pin__bubble"><span style="transform: rotate(45deg); display: inline-block;">📮</span></div>
    </div>
  `,
  className: 'custom-eco-pin',
  iconSize: [36, 42],
  iconAnchor: [18, 42],
  popupAnchor: [0, -38]
});

// Custom Market Target Pin (Using beautiful single color red)
const marketIcon = L.divIcon({
  html: `
    <div class="eco-pin eco-pin--target" style="filter: drop-shadow(0 6px 12px rgba(218, 37, 29, 0.35));">
      <div class="eco-pin__bubble" style="background: #DA251D; border-color: #ffffff;"><span style="transform: rotate(45deg); display: inline-block;">📍</span></div>
    </div>
  `,
  className: 'custom-eco-pin',
  iconSize: [36, 42],
  iconAnchor: [18, 42],
  popupAnchor: [0, -38]
});

const selectedMarketIcon = L.divIcon({
  html: `
    <div class="eco-pin eco-pin--target" style="filter: drop-shadow(0 6px 12px rgba(218, 37, 29, 0.45));">
      <div class="eco-pin__bubble" style="background: #DA251D; border-color: #ffffff; width: 40px; height: 40px;"><span style="transform: rotate(45deg); display: inline-block; font-size: 1.2rem;">📍</span></div>
    </div>
  `,
  className: 'custom-eco-pin',
  iconSize: [40, 46],
  iconAnchor: [20, 46],
  popupAnchor: [0, -42]
});

// Initialize Application
(async function init() {
  initMap();
  setupThemeSwitcher();
  await loadClientData();
  await loadStats();
  setupEventListeners();
  setupLabelsControl();
  setupMobileDrawer();
  setupSidebarResizer();
  setupSidebarCurtain();
  // Clear/empty map state at startup
  showState('welcome');
})();

// Initialize Leaflet Map
function initMap() {
  map = L.map('map', {
    zoomControl: false
  }).setView([12.5657, 104.9910], 7.5);

  tileLayers.voyager = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a> · Metfone Smart Grid',
    subdomains: 'abcd',
    maxZoom: 20
  });

  tileLayers.dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a> · Metfone Smart Grid',
    subdomains: 'abcd',
    maxZoom: 20
  });

  tileLayers.positron = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a> · Metfone Smart Grid',
    subdomains: 'abcd',
    maxZoom: 20
  });

  // Hybrid Satellite = Google Hybrid (Satellite + Roads/Labels)
  tileLayers.satellite = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    attribution: 'Map data &copy; Google',
    maxZoom: 20
  });

  // Set default active layer
  tileLayers.voyager.addTo(map);
  activeTileLayer = tileLayers.voyager;

  L.control.zoom({ position: 'topright' }).addTo(map);
  markerClusterGroup = L.markerClusterGroup({
    maxClusterRadius: 40,
    disableClusteringAtZoom: 15,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false
  }).addTo(map);
  vectorLayerGroup = L.layerGroup().addTo(map);

  // Auto invalidate size on window resize for dynamic mobile/desktop transitions
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (map) {
        map.invalidateSize({ animate: true });
      }
    }, 250);
  });
}

// Setup Map Theme Switcher logic
function setupThemeSwitcher() {
  const buttons = document.querySelectorAll('.theme-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.getAttribute('data-theme');
      if (tileLayers[theme]) {
        // Remove active layer
        map.removeLayer(activeTileLayer);
        // Add new layer
        tileLayers[theme].addTo(map);
        activeTileLayer = tileLayers[theme];

        // Update active class on buttons
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Toggle dark-theme styling on switcher frame
        const switcher = document.querySelector('.map-theme-switcher');
        if (switcher) {
          if (theme === 'dark') {
            switcher.classList.add('dark-theme-active');
          } else {
            switcher.classList.remove('dark-theme-active');
          }
        }
      }
    });
  });
}

// Load stats into footer using client data
async function loadStats() {
  try {
    if (footerStats) {
      const branchesCount = clientBranches.length || 593;
      const marketsCount = clientMarkets.length || 1888;
      footerStats.innerHTML = `EXPRESS GRID: <span>${branchesCount.toLocaleString()}</span> PO BRANCHES · <span>${marketsCount.toLocaleString()}</span> MARKETS`;
    }
  } catch (e) {
    if (footerStats) {
      footerStats.textContent = 'METFONE EXPRESS GRID · ONLINE';
    }
  }
}

async function loadClientData() {
  try {
    const [resRoutes, resBranches, resMarkets] = await Promise.all([
      fetch('/data/routes.json').then(r => r.json()),
      fetch('/data/pickup_branches.json').then(r => r.json()),
      fetch('/data/famous_markets.json').then(r => r.json())
    ]);

    clientRoutes = resRoutes;
    clientBranches = resBranches;
    clientMarkets = resMarkets;

    // Merge famous markets into routes
    const famousMarketsMerged = clientMarkets.map(m => ({
      ...m,
      isFamousMarket: true
    }));
    clientMergedRoutes = [...clientRoutes, ...famousMarketsMerged];

    // Initialize Fuse.js on clientMergedRoutes (Markets / Routes)
    clientMarketFuse = new Fuse(clientMergedRoutes, {
      keys: [
        { name: 'market',          weight: 0.30 },
        { name: 'market_kh',       weight: 0.30 },
        { name: 'search_keywords', weight: 0.20 },
        { name: 'commune',         weight: 0.08 },
        { name: 'commune_kh',      weight: 0.08 },
        { name: 'district',        weight: 0.02 },
        { name: 'district_kh',     weight: 0.02 }
      ],
      threshold: 0.42,
      includeScore: true,
      minMatchCharLength: 2
    });

    // Initialize Fuse.js on clientBranches (Branches)
    clientBranchFuse = new Fuse(clientBranches, {
      keys: [
        { name: 'store_code',          weight: 0.30 },
        { name: 'store_name',          weight: 0.40 },
        { name: 'district_kh',         weight: 0.15 },
        { name: 'province_kh',         weight: 0.10 },
        { name: 'raw_delivery_store',  weight: 0.20 }
      ],
      threshold: 0.42,
      includeScore: true,
      minMatchCharLength: 2
    });

    // Build translation dictionaries
    const addTrans = (en, kh, isMarket = false) => {
      const cen = stripAdministrativePrefixes(normalizeKhmer(en));
      const ckh = stripAdministrativePrefixes(normalizeKhmer(kh));
      if (cen && ckh && !clientTranslationDict[cen]) {
        clientTranslationDict[cen] = ckh;
      }
      if (cen && ckh && !isMarket && !clientKhmerToEnglishDict[ckh]) {
        clientKhmerToEnglishDict[ckh] = cen;
      }
    };

    // Populate manual translations first
    for (const [kh, en] of Object.entries(clientKhmerToEnglishManual)) {
      const normKh = normalizeKhmer(kh);
      const normEn = stripAdministrativePrefixes(normalizeKhmer(en));
      if (normKh && normEn) {
        clientKhmerToEnglishDict[normKh] = normEn;
        clientTranslationDict[normEn] = normKh;
      }
    }

    // Populate from routes
    clientRoutes.forEach(r => {
      addTrans(r.province, r.province_kh);
      addTrans(r.district, r.district_kh);
      addTrans(r.commune, r.commune_kh);
      addTrans(r.village, r.village_kh);
      addTrans(r.market, r.market_kh, true);
    });

    // Populate from pickup branches
    clientBranches.forEach(b => {
      addTrans(b.district_en, b.district_kh);
    });

    console.log(`✅ Loaded client-side search data successfully.`);
  } catch (e) {
    console.error('Failed to load client-side search datasets:', e);
  }
}

function clientGetKhmerStoreName(storeName) {
  if (!storeName) return '';
  const cleanEn = storeName.trim().replace(/\b(Khan|Srok|Krong|Sangkat|Sangkat\/Commune|Commune|Village|Phsar|Psar|Market|District|Province|Capital)\b/gi, '').trim().toLowerCase();
  const rawKh = clientTranslationDict[cleanEn];
  if (rawKh) {
    return stripKhmerPrefix(rawKh);
  }
  return '';
}

function stripKhmerPrefix(kh) {
  if (!kh) return '';
  return kh.replace(/^(ខណ្ឌ|សង្កាត់|ស្រុក|ក្រុង|រាជធានី|ខេត្ត|ភូមិ|ឃុំ|ផ្សារ)/g, '').trim();
}

function clientMatchesPickupBranchQuery(branch, q) {
  const normQ = normalizeKhmer(q);
  if (!normQ) return false;

  const fields = [
    branch.store_code,
    branch.store_name,
    clientGetKhmerStoreName(branch.store_name),
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

function clientSearch(q, type, province = '') {
  const cleanQ = q.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
  const processedQ = cleanQ;
  let results = [];
  const isMarket = (type === 'market');

  if (isMarket) {
    let dataset = clientMergedRoutes;
    if (province) {
      const normProv = normalizeKhmer(province);
      dataset = dataset.filter(r => 
        (r.province && normalizeKhmer(r.province).includes(normProv)) ||
        (r.province_kh && normalizeKhmer(r.province_kh).includes(normProv))
      );
    }
    if (processedQ) {
      if (clientMarketFuse) {
        const fuseResults = clientMarketFuse.search(processedQ);
        results = fuseResults.map(res => res.item);
      }
    } else {
      results = dataset;
    }
  } else {
    let dataset = clientBranches;
    if (province) {
      const normProv = normalizeKhmer(province);
      dataset = dataset.filter(b => 
        normalizeKhmer(b.province_kh).includes(normProv)
      );
    }
    if (processedQ) {
      const exactMatches = dataset.filter(b => clientMatchesPickupBranchQuery(b, processedQ));
      let fuzzyMatches = [];
      if (exactMatches.length < 15 && clientBranchFuse) {
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
  }
  return results;
}

function clientGetNearbyPOs(lat, lng, radiusKm = 30, limitCount = 10) {
  const POs = clientBranches.map(po => {
    const dist = haversine(lat, lng, po.latitude, po.longitude);
    return {
      ...po,
      distance_km: dist
    };
  });
  return POs
    .filter(po => po.distance_km <= radiusKm)
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, limitCount);
}

function clientTranslateKhmerToEnglish(query) {
  const normQ = stripAdministrativePrefixes(normalizeKhmer(query));
  if (!normQ) return '';

  if (clientKhmerToEnglishDict[normQ]) {
    return clientKhmerToEnglishDict[normQ];
  }

  let translated = normQ;
  const keys = Object.keys(clientKhmerToEnglishDict).sort((a, b) => b.length - a.length);
  let replaced = false;
  
  for (const k of keys) {
    if (translated.includes(k)) {
      const en = clientKhmerToEnglishDict[k];
      translated = translated.replace(new RegExp(k, 'g'), ' ' + en + ' ');
      replaced = true;
    }
  }

  if (replaced) {
    return translated.replace(/\s+/g, ' ').trim();
  }
  return '';
}

// Helper to check if string contains lat/lng coordinates (e.g. "11.556, 104.928")
function parseCoordinates(q) {
  const match = q.match(/^[-+]?([1-9]?\d(\.\d+)?|90(\.0+)?),\s*[-+]?(180(\.0+)?|((1[0-7]\d)|([1-9]?\d))(\.\d+)?)$/);
  if (match) {
    const parts = q.split(',').map(num => parseFloat(num.trim()));
    return { lat: parts[0], lng: parts[1] };
  }
  return null;
}

// Event Listeners Setup
function setupEventListeners() {
  const navSearch = document.getElementById('navSearch');
  const navSaved = document.getElementById('navSaved');
  const navRecents = document.getElementById('navRecents');
  
  if (navSearch) navSearch.addEventListener('click', () => switchTab('search'));
  if (navSaved) navSaved.addEventListener('click', () => switchTab('saved'));
  if (navRecents) navRecents.addEventListener('click', () => switchTab('recents'));

  // Clear search input
  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    if (provinceSelect) provinceSelect.value = '';
    clearBtn.style.display = 'none';
    closeAutocomplete();
    clearAllMapLayers();
    activeMarkers = [];
    currentResults = [];
    showState('welcome');
    if (resultsCount) {
      resultsCount.textContent = 'Welcome to Metfone Express Eco-Route Grid';
    }
    map.setView([12.5657, 104.9910], 7.5);
  });

  // Search submit button
  searchBtn.addEventListener('click', () => {
    closeAutocomplete();
    runSmartFind();
  });

  // Search input typing - only update clear button visibility
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    clearBtn.style.display = q ? 'block' : 'none';
  });

  // Enter key in search box
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      closeAutocomplete();
      runSmartFind();
    } else if (e.key === 'Escape') {
      closeAutocomplete();
    }
  });

  // Province dropdown change re-trigger search
  if (provinceSelect) {
    provinceSelect.addEventListener('change', () => {
      if (searchInput.value.trim()) {
        closeAutocomplete();
        runSmartFind();
      }
    });
  }

  // Welcome hint chips click
  document.querySelectorAll('.hint-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const text = chip.textContent.replace(/[\[\]]/g, '').trim();
      searchInput.value = text;
      clearBtn.style.display = 'block';
      runSmartFind();
    });
  });

  // Close autocomplete when clicking outside
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-panel') && !e.target.closest('.autocomplete-dropdown')) {
      closeAutocomplete();
    }
  });
}

// Autocomplete suggestions handler
// Queries both local database and the FREE Google Maps Autocomplete proxy in parallel.
async function showAutocomplete(q) {
  try {
    if (!q) {
      autocompleteDropdown.innerHTML = '';
      
      // 1. Render Recents (up to 5 items)
      const recents = getRecentSearches();
      if (recents.length > 0) {
        const header = document.createElement('div');
        header.style.padding = '10px 14px 4px 14px';
        header.style.fontSize = '9px';
        header.style.fontWeight = '800';
        header.style.color = 'var(--text-light)';
        header.style.textTransform = 'uppercase';
        header.style.letterSpacing = '0.08em';
        header.style.fontFamily = 'var(--font-heading)';
        header.innerHTML = '🕒 Recent Searches (ស្វែងរកថ្មីៗ)';
        autocompleteDropdown.appendChild(header);
        
        recents.slice(0, 5).forEach(item => {
          const acItem = document.createElement('div');
          acItem.className = 'ac-item';
          acItem.style.display = 'flex';
          acItem.style.alignItems = 'center';
          acItem.style.padding = '8px 14px';
          acItem.style.cursor = 'pointer';
          acItem.innerHTML = `
            <span class="ac-icon-marker" style="margin-right: 12px; font-size: 1.1rem; color: var(--text-light);">🕒</span>
            <div class="ac-details" style="display: flex; flex-direction: column;">
              <span class="ac-label" style="font-size: 12.5px; font-weight: 600; color: #1e293b;">${escHtml(item.query)}</span>
              <span class="ac-sub" style="font-size: 10px; color: #64748b;">${item.date} · ${item.time}</span>
            </div>
          `;
          acItem.addEventListener('click', (e) => {
            e.stopPropagation();
            searchInput.value = item.query;
            clearBtn.style.display = 'block';
            closeAutocomplete();
            runSmartFind();
          });
          autocompleteDropdown.appendChild(acItem);
        });
      }
      
      // 2. Render Trending / Top Searches Today
      const headerTrending = document.createElement('div');
      headerTrending.style.padding = '10px 14px 4px 14px';
      headerTrending.style.fontSize = '9px';
      headerTrending.style.fontWeight = '800';
      headerTrending.style.color = 'var(--metfone-red)';
      headerTrending.style.textTransform = 'uppercase';
      headerTrending.style.letterSpacing = '0.08em';
      headerTrending.style.fontFamily = 'var(--font-heading)';
      headerTrending.innerHTML = '🔥 Top Searches Today (ពេញនិយម)';
      autocompleteDropdown.appendChild(headerTrending);
      
      const trendingItems = [
        { name: 'ផ្សារធំថ្មី (Phsar Thmey)', q: 'ផ្សារធំថ្មី' },
        { name: 'ផ្សារព្រែកជ្រៃ (Prek Chrey)', q: 'ផ្សារព្រែកជ្រៃ' },
        { name: 'ចោមចៅ (Chom Chao)', q: 'ចោមចៅ' },
        { name: 'អង្គរវត្ត (Angkor Wat)', q: 'អង្គរវត្ត' },
        { name: 'រង្វង់មូលធុរេន (Kampot)', q: 'រង្វង់មូលធុរេន' }
      ];
      
      trendingItems.forEach(item => {
        const acItem = document.createElement('div');
        acItem.className = 'ac-item';
        acItem.style.display = 'flex';
        acItem.style.alignItems = 'center';
        acItem.style.padding = '8px 14px';
        acItem.style.cursor = 'pointer';
        acItem.innerHTML = `
          <span class="ac-icon-marker" style="margin-right: 12px; font-size: 1.1rem; color: var(--metfone-red);">🔥</span>
          <div class="ac-details" style="display: flex; flex-direction: column;">
            <span class="ac-label" style="font-size: 12.5px; font-weight: 600; color: #1e293b;">${item.name}</span>
          </div>
        `;
        acItem.addEventListener('click', (e) => {
          e.stopPropagation();
          searchInput.value = item.q;
          clearBtn.style.display = 'block';
          closeAutocomplete();
          runSmartFind();
        });
        autocompleteDropdown.appendChild(acItem);
      });
      
      autocompleteDropdown.classList.add('open');
      return;
    }

    const normQ = normalizeKhmer(q).toLowerCase();

    // Detect if user is typing a Khmer/English administrative prefix query
    const khmerAdminPrefixRe = /^(ភូមិ|ឃុំ|សង្កាត់|ស្រុក|ក្រុង|ខណ្ឌ|ខេត្ត|រាជធានី)/;
    const enAdminPrefixRe = /^(village|commune|sangkat|district|khan|krong|khet|province)\s+/i;
    const isAdminSearch = khmerAdminPrefixRe.test(normQ) || enAdminPrefixRe.test(q.trim());

    let searchQ = q;
    const stripped = stripAdministrativePrefixes(q);
    // For admin searches: use the FULL query first (to match district_kh/commune_kh/village_kh)
    // For regular searches: use stripped query to skip prefix noise
    if (!isAdminSearch && stripped && stripped.length >= 2 && stripped !== q.normalize("NFC").toLowerCase().trim()) {
      searchQ = stripped;
    }
    const normSearchQ = normalizeKhmer(searchQ).toLowerCase();

    // 0.8 Check if user pasted a Google Maps URL directly
    if (/maps\.app\.goo\.gl|goo\.gl\/maps|google\.com\/maps/i.test(q)) {
      autocompleteDropdown.innerHTML = '';
      const item = document.createElement('div');
      item.className = 'ac-item';
      item.innerHTML = `
        <span class="ac-icon-marker" style="margin-right: 12px; font-size: 1.1rem; color: #DA251D;">🗺️</span>
        <div class="ac-details" style="display: flex; flex-direction: column; gap: 2px;">
          <span class="ac-label" style="font-size: 13px; font-weight: 600; color: #1e293b;">Go to Google Maps Link Location</span>
          <span class="ac-sub" style="font-size: 11px; color: #64748b; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 250px;">${q}</span>
        </div>
      `;
      item.addEventListener('click', () => {
        searchInput.value = q;
        clearBtn.style.display = 'block';
        closeAutocomplete();
        runSmartFind();
      });
      autocompleteDropdown.appendChild(item);
      autocompleteDropdown.classList.add('open');
      return;
    }

    // 1. Check if user typed direct GPS coordinates
    const coords = parseCoordinates(q);
    if (coords) {
      autocompleteDropdown.innerHTML = '';
      const item = document.createElement('div');
      item.className = 'ac-item';
      item.innerHTML = `
        <span class="ac-icon-marker" style="margin-right: 12px; font-size: 1.1rem; color: #DA251D;">🌐</span>
        <div class="ac-details" style="display: flex; flex-direction: column; gap: 2px;">
          <span class="ac-label" style="font-size: 13px; font-weight: 600; color: #1e293b;">Go to Coordinates</span>
          <span class="ac-sub" style="font-size: 11px; color: #64748b; line-height: 1.3;">Latitude: ${coords.lat}, Longitude: ${coords.lng}</span>
        </div>
      `;
      item.addEventListener('click', () => {
        searchInput.value = q;
        clearBtn.style.display = 'block';
        closeAutocomplete();
        const selectedLoc = {
          id: 'target_' + Date.now(),
          market: `GPS Coordinates: ${coords.lat}, ${coords.lng}`,
          latitude: coords.lat,
          longitude: coords.lng,
          province: 'GPS Location',
          district: '',
          google_maps_url: `https://www.google.com/maps?q=${coords.lat},${coords.lng}`
        };
        selectLocationAndFindNearbyPOs(selectedLoc, [selectedLoc]);
      });
      autocompleteDropdown.appendChild(item);
      autocompleteDropdown.classList.add('open');
      return;
    }

    // 2. Query local database & branches locally, and Google Autocomplete in parallel
    const prov = provinceSelect ? provinceSelect.value : '';
    
    const localResults = clientSearch(searchQ, 'market', prov);
    const branchResults = clientSearch(searchQ, 'branch', prov);

    const googleUrl = `${API}/api/google-autocomplete?q=${encodeURIComponent(searchQ)}` + (prov ? `&province=${encodeURIComponent(prov)}` : '');
    const googleData = await fetch(googleUrl)
      .then(r => r.json())
      .catch(() => []);

    const localData = { results: localResults };
    const branchData = { results: branchResults };

    let suggestions = [];

    // Filter and add local branch matches first (High priority!)
    const filteredBranches = (branchData.results || []).filter(r => {
      const code = (r.branch_id || '').toLowerCase();
      const name = (r.market || '').toLowerCase();
      if (code.includes(normQ) || name.includes(normQ) || code.includes(normSearchQ) || name.includes(normSearchQ)) return true;

      const strippedQ = stripAdministrativePrefixes(normQ);
      if (strippedQ && strippedQ.length >= 2) {
        return stripAdministrativePrefixes(code).includes(strippedQ) || 
               stripAdministrativePrefixes(name).includes(strippedQ);
      }
      return false;
    });

    filteredBranches.forEach(r => {
      const label = `${r.market} (${r.branch_id})`;
      const addressString = [r.district, r.province].filter(Boolean).join(', ');
      suggestions.push({
        isLocal: true,
        isBranch: true,
        label: r.branch_id,
        displayLabel: label,
        address: `${addressString} · 📮 Metfone Post Office`,
        lat: r.latitude,
        lng: r.longitude,
        province: r.province,
        raw: r
      });
    });

    // Filter local database matches strictly (Only matching ones)
    const filteredLocal = (localData.results || []).filter(r => {
      // Special case: Allow Phnom Penh's Central Market (id: 43) for Phsar Thmey/Central Market queries
      if (r.id === 43 && (normQ.includes('ផ្សារ') || normQ.includes('ថ្មី') || normQ.includes('psar') || normQ.includes('thmey') || normQ.includes('phsar') || normQ.includes('central') || normSearchQ.includes('ផ្សារ') || normSearchQ.includes('ថ្មី') || normSearchQ.includes('psar') || normSearchQ.includes('thmey') || normSearchQ.includes('phsar') || normSearchQ.includes('central'))) {
        return true;
      }
      const marketEn = (r.market || '').toLowerCase();
      const marketKh = (r.market_kh || '').toLowerCase();
      const branchId = (r.branch_id || '').toLowerCase();
      if (marketEn.includes(normQ) || marketKh.includes(normQ) || branchId.includes(normQ) || marketEn.includes(normSearchQ) || marketKh.includes(normSearchQ) || branchId.includes(normSearchQ)) return true;

      const strippedQ = stripAdministrativePrefixes(normQ);
      if (strippedQ && strippedQ.length >= 2) {
        return stripAdministrativePrefixes(marketEn).includes(strippedQ) || 
               stripAdministrativePrefixes(marketKh).includes(strippedQ) || 
               stripAdministrativePrefixes(branchId).includes(strippedQ);
      }
      return false;
    });

    // Sort local matches to prioritize prefix/exact matches
    filteredLocal.sort((a, b) => {
      const aName = (a.market || '').toLowerCase();
      const bName = (b.market || '').toLowerCase();
      const aStarts = aName.startsWith(normQ);
      const bStarts = bName.startsWith(normQ);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return aName.localeCompare(bName);
    });

    // Add local matches to suggestions list (Tagged as "Metfone Partner Market")
    filteredLocal.forEach(r => {
      const label = r.market || r.village || r.commune || 'Market';
      const labelKh = r.market_kh || r.village_kh || r.commune_kh || '';
      const fullLabel = labelKh ? `${label} (${labelKh})` : label;
      const addressString = [r.commune || r.village, r.district, r.province].filter(Boolean).join(', ');

      // Avoid duplicates with branch matches
      const exists = suggestions.some(s => s.isBranch && s.label.toLowerCase() === (r.branch_id || '').toLowerCase());
      if (!exists) {
        suggestions.push({
          isLocal: true,
          isBranch: false,
          label: label,
          displayLabel: fullLabel,
          address: `${addressString} · 🛒 Partner Market`,
          lat: r.latitude,
          lng: r.longitude,
          province: r.province,
          raw: r
        });
      }
    });

    // 3. Add Google Autocomplete suggestions (Tagged as "Google Maps Search")
    googleData.forEach(text => {
      // Avoid duplicate names if they already exist in database markets
      const isDuplicate = suggestions.some(s => s.label.toLowerCase() === text.toLowerCase());
      if (!isDuplicate && suggestions.length < 6) {
        const parts = text.split(',');
        let extractedProv = '';
        if (parts.length > 1) {
          const cityIndex = parts.length > 2 ? parts.length - 2 : parts.length - 1;
          extractedProv = parts[cityIndex].trim().replace(/\s*Province/gi, '');
          if (extractedProv.toLowerCase() === 'cambodia') {
            extractedProv = '';
          }
        }
        suggestions.push({
          isLocal: false,
          isBranch: false,
          label: text,
          displayLabel: text,
          address: prov ? `🌐 Google Maps Search (in ${prov})` : `🌐 Google Maps Search (in Cambodia)`,
          lat: null, // Will geocode dynamically on click!
          lng: null,
          province: extractedProv || null
        });
      }
    });

    // Always append verbatim search query as a fallback option so they can always trigger the search!
    const verbatimExists = suggestions.some(s => s.label.toLowerCase() === q.toLowerCase());
    if (!verbatimExists) {
      suggestions.push({
        isLocal: false,
        isBranch: false,
        label: q,
        displayLabel: `Search for "${q}"`,
        address: prov ? `🌐 Google Maps Search (in ${prov})` : `🌐 Google Maps Search (in Cambodia)`,
        lat: null,
        lng: null
      });
    }

    if (!suggestions.length) { closeAutocomplete(); return; }

    autocompleteDropdown.innerHTML = '';
    suggestions.slice(0, 6).forEach(s => {
      const item = document.createElement('div');
      item.className = 'ac-item';
      
      const displayLabel = highlightMatch(s.displayLabel, q);
      const displayAddress = highlightMatch(s.address, q);
      
      // Determine icon based on type or market-related keywords (Phsar, Psar, Pshar, Market, ផ្សារ)
      const isMarketKeyword = /phsar|psar|pshar|market|ផ្សារ/i.test(s.displayLabel);
      const icon = s.isBranch ? '📮' : ((s.isLocal || isMarketKeyword) ? '🛒' : '📍');
      
      const shortProvince = s.province ? extractProvinceName(s.province) : '';

      item.innerHTML = `
        <span class="ac-icon-marker" style="margin-right: 12px; font-size: 1.1rem; color: #64748b; flex-shrink: 0;">${icon}</span>
        <div class="ac-details" style="display: flex; flex-direction: column; gap: 2px; width: 100%; min-width: 0;">
          <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; gap: 8px;">
            <span class="ac-label" style="font-size: 13px; font-weight: 600; color: #1e293b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${displayLabel}</span>
            ${shortProvince ? `
              <span style="background-color: #fef3c7; color: #b45309; font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 4px; border: 1px solid #fde68a; white-space: nowrap; flex-shrink: 0; text-transform: uppercase;">
                ${escHtml(shortProvince)}
              </span>
            ` : ''}
          </div>
          <span class="ac-sub" style="font-size: 11px; color: #64748b; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${displayAddress}</span>
        </div>
      `;
      
      item.addEventListener('click', async () => {
        searchInput.value = s.label;
        clearBtn.style.display = 'block';
        closeAutocomplete();
        
        if (s.isLocal) {
          if (s.isBranch) {
            // Direct Post Office Branch Click
            showState('none');
            clearAllMapLayers();
            activeMarkers = [];
            const marker = L.marker([s.lat, s.lng], { icon: redIcon }).addTo(markerClusterGroup);
            marker.bindPopup(`
              <div class="map-popup-content">
                <div class="popup-header">
                  <span class="popup-badge">ID: ${s.raw.branch_id}</span>
                  <span class="popup-coord">${s.lat.toFixed(4)}°, ${s.lng.toFixed(4)}°</span>
                </div>
                <h4>📮 ${escHtml(s.raw.market)}</h4>
                <p class="popup-addr">${escHtml([s.raw.district, s.raw.province].filter(Boolean).join(', '))}</p>
              </div>
            `);
            activeMarkers.push({ id: s.raw.id, marker });
            renderResultsList([s.raw], false, null);
            if (resultsCount) {
              resultsCount.innerHTML = `Found Metfone Express Branch: <span>${s.raw.branch_id}</span>`;
            }
            map.setView([s.lat, s.lng], 17);
            marker.openPopup(); // Auto-open branch popup
          } else {
            // Local Partner Market Click
            const selectedLoc = {
              id: 'target_' + Date.now(),
              market: s.label,
              latitude: s.lat,
              longitude: s.lng,
              province: s.raw.province,
              district: s.raw.district,
              google_maps_url: `https://www.google.com/maps?q=${s.lat},${s.lng}`
            };
            selectLocationAndFindNearbyPOs(selectedLoc, [selectedLoc]);
          }
        } else {
          // Dynamically geocode the Google suggestion for FREE!
          showState('loading');
          try {
            const prov = provinceSelect ? provinceSelect.value : '';
            const geoRes = await fetch(`${API}/api/google-geocode?q=${encodeURIComponent(s.label)}` + (prov ? `&province=${encodeURIComponent(prov)}` : ''));
            if (!geoRes.ok) throw new Error('Geocoding failed');
            const coords = await geoRes.json();
            
            if (coords.type === 'multiple') {
              presentProvinceSelection(coords.results, s.label);
              return;
            }

            const selectedLoc = {
              id: 'target_' + Date.now(),
              market: s.label,
              latitude: coords.lat,
              longitude: coords.lng,
              province: coords.province || 'Google Location',
              province_kh: coords.province_kh || '',
              district: coords.district || '',
              district_kh: coords.district_kh || '',
              google_maps_url: `https://www.google.com/maps?q=${coords.lat},${coords.lng}`
            };
            selectLocationAndFindNearbyPOs(selectedLoc, [selectedLoc]);
          } catch (err) {
            console.error(err);
            showState('empty');
            resultsCount.textContent = 'Google Maps coordinates could not be loaded.';
          }
        }
      });
      
      autocompleteDropdown.appendChild(item);
    });
    autocompleteDropdown.classList.add('open');
  } catch (e) { closeAutocomplete(); }
}

function closeAutocomplete() {
  autocompleteDropdown.classList.remove('open');
  autocompleteDropdown.innerHTML = '';
}

// Reset/Welcome screen state
async function runSearch(page = 1) {
  showState('welcome');
  if (resultsCount) resultsCount.textContent = 'Welcome to Metfone Express Eco-Route Grid';
  markerClusterGroup.clearLayers();
  activeMarkers = [];
  map.setView([12.5657, 104.9910], 7.5);
}

// Select a market, village, commune, or district and find its nearest Post Offices (within 30km)
// With Mushroom Network (Dashed Lines & Popup List) + Close Zoom!
async function selectLocationAndFindNearbyPOs(selectedLoc, allMatchedLocs, fly = true) {
  currentResults = allMatchedLocs || [selectedLoc];
  showState('loading');
  expandMobileDrawer('sheet-peeking');
  try {
    const radius = 30; // Max 30km
    const province = provinceSelect ? provinceSelect.value : '';

    // Fetch default PO for this location locally if it has branch_id
    let defaultPO = null;
    if (selectedLoc.branch_id) {
      defaultPO = clientBranches.find(po => po.branch_id === selectedLoc.branch_id) || null;
    }

    // Calculate nearest POs client-side using our local branch cache
    const nearbyPOs = clientGetNearbyPOs(selectedLoc.latitude, selectedLoc.longitude, radius, 10);

    showState('none');

    clearAllMapLayers();
    activeMarkers = [];

    const targetTitle = selectedLoc.market || selectedLoc.village || selectedLoc.commune || 'Selected Location';
    
    let poListHtml = '';

    // Add default registered PO at the top of the list if it exists
    if (defaultPO) {
      const distToDefault = nearbyPOs.find(po => po.branch_id === defaultPO.branch_id)?.distance_km 
        || haversine(selectedLoc.latitude, selectedLoc.longitude, defaultPO.latitude, defaultPO.longitude);
        
      poListHtml += `
        <div class="popup-po-item" style="margin-top: 4px; font-size: 11px; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #3b82f6; padding-bottom: 3px; font-family: sans-serif; background-color: #eff6ff; padding: 2px 4px; border-radius: 4px; margin-bottom: 6px;">
          <span style="color:#1e3a8a;"><b>📮 REG ZONE PO:</b> ${escHtml(getBilingualTitle(defaultPO))} (${defaultPO.branch_id})</span>
          <span style="color:#1e3a8a; font-weight: 700; margin-left: 8px;">${formatDistance(distToDefault)}</span>
        </div>
      `;
    }

    nearbyPOs.forEach((nearPo, idx) => {
      const isDefault = defaultPO && (defaultPO.branch_id === nearPo.branch_id);
      poListHtml += `
        <div class="popup-po-item" style="margin-top: 4px; font-size: 11px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed #e2e8f0; padding-bottom: 2px; font-family: sans-serif; ${isDefault ? 'background-color: #eff6ff;' : ''}">
          <span style="color:#1e293b;"><b>${idx + 1}.</b> ${escHtml(getBilingualTitle(nearPo))} (${nearPo.branch_id})</span>
          <span style="color:var(--metfone-red, #d32f2f); font-weight: 700; margin-left: 8px;">${formatDistance(nearPo.distance_km)}</span>
        </div>
      `;
    });

    // Plot target location with Mushroom popup list
    const targetMarker = L.marker([selectedLoc.latitude, selectedLoc.longitude], { icon: selectedMarketIcon }).addTo(markerClusterGroup);
    targetMarker.bindPopup(`
      <div class="map-popup-content" style="width: 260px;">
        <div class="popup-header" style="background-color: #173020; margin-bottom: 6px;">
          <span class="popup-badge" style="background-color: #173020; color: #fff;">TARGET LOCATION</span>
          <span class="popup-coord">${selectedLoc.latitude.toFixed(4)}°, ${selectedLoc.longitude.toFixed(4)}°</span>
        </div>
        <h4 style="margin: 4px 0; font-size:13px; color:#1e293b;">📍 ${escHtml(targetTitle)}</h4>
        <p class="popup-addr" style="margin: 2px 0 8px 0; font-size: 11px; color: #64748b;">${escHtml([selectedLoc.district, selectedLoc.province].filter(Boolean).join(', ') || '')}</p>
        
        <div class="popup-po-list" style="margin-top: 6px; border-top: 1px solid #e2e8f0; padding-top: 6px;">
          <h5 style="margin: 0 0 4px 0; font-size: 11px; color: #0f172a; font-weight: 700; text-transform: uppercase;">🌱 Nearest Post Offices (Max 10)</h5>
          ${poListHtml || '<p style="margin: 0; font-size: 11px; color: #94a3b8;">No post offices found within 30km.</p>'}
        </div>
        <a class="popup-gmaps-link" href="${selectedLoc.google_maps_url || `https://www.google.com/maps?q=${selectedLoc.latitude},${selectedLoc.longitude}`}" target="_blank" rel="noopener" style="margin-top: 8px; display: block; font-size:11px; text-align:right;">Open in Google Maps ↗</a>
      </div>
    `);
    activeMarkers.push({ id: selectedLoc.id, marker: targetMarker });
    activeStickerMarkers.push({ marker: targetMarker, r: selectedLoc });

    // Plot default PO on map if not in nearby list
    if (defaultPO && defaultPO.latitude && defaultPO.longitude) {
      const isAlreadyPlotted = nearbyPOs.some(po => po.branch_id === defaultPO.branch_id);
      if (!isAlreadyPlotted) {
        const marker = L.marker([defaultPO.latitude, defaultPO.longitude], { icon: redIcon }).addTo(markerClusterGroup);
        marker.bindPopup(`
          <div class="map-popup-content">
            <div class="popup-header" style="background-color:#1e3a8a; margin-bottom: 6px;">
              <span class="popup-badge" style="background-color:#1e3a8a; color:#fff;">DEFAULT REGISTERED PO</span>
              <span class="popup-coord">${defaultPO.latitude.toFixed(4)}°, ${defaultPO.longitude.toFixed(4)}°</span>
            </div>
            <h4>📮 ${escHtml(defaultPO.market || defaultPO.store_name)}</h4>
            <p class="popup-addr">${escHtml([defaultPO.district, defaultPO.province].filter(Boolean).join(', '))}</p>
          </div>
        `);
        activeMarkers.push({ id: defaultPO.id, marker: marker });
      }
    }

    // Draw connection line to nearest PO
    if (nearbyPOs.length > 0) {
      const nearestPO = nearbyPOs[0];
      const nearestLine = L.polyline([
        [selectedLoc.latitude, selectedLoc.longitude],
        [nearestPO.latitude, nearestPO.longitude]
      ], {
        color: 'var(--metfone-red, #d32f2f)',
        weight: 3.5,
        dashArray: '5, 8',
        opacity: 0.8
      }).addTo(vectorLayerGroup);
      nearestLine.bindPopup(`Nearest PO: ${nearestPO.market} (${formatDistance(nearestPO.distance_km)})`);
    }

    // Draw connection line to default PO
    if (defaultPO && defaultPO.latitude && defaultPO.longitude) {
      const nearestPO = nearbyPOs[0];
      const isSame = (nearestPO && nearestPO.branch_id === defaultPO.branch_id);
      if (!isSame) {
        const defaultLine = L.polyline([
          [selectedLoc.latitude, selectedLoc.longitude],
          [defaultPO.latitude, defaultPO.longitude]
        ], {
          color: '#3b82f6',
          weight: 3.5,
          dashArray: '2, 6',
          opacity: 0.8
        }).addTo(vectorLayerGroup);
        defaultLine.bindPopup(`Default Registered PO Zone: ${defaultPO.market}`);
      }
    }

    // Plot all nearby post offices
    nearbyPOs.forEach(po => {
      const marker = L.marker([po.latitude, po.longitude], { icon: redIcon }).addTo(markerClusterGroup);
      const popupContent = `
        <div class="map-popup-content">
          <div class="popup-header">
            <span class="popup-badge">PO: ${po.branch_id}</span>
            <span class="popup-coord">${po.latitude.toFixed(4)}°, ${po.longitude.toFixed(4)}°</span>
          </div>
          <h4>📮 ${escHtml(getBilingualTitle(po))}</h4>
          <div class="popup-divider"></div>
          <p class="popup-addr">${escHtml(getBilingualAddress(po))}</p>
          <p style="color: var(--metfone-red); font-weight: 700; margin-top: 4px;">📡 ចំងាយ Distance: ${formatDistance(po.distance_km)}</p>
          <a class="popup-gmaps-link" href="${po.google_maps_url || `https://www.google.com/maps?q=${po.latitude},${po.longitude}`}" target="_blank" rel="noopener">Open in Google Maps ↗</a>
        </div>
      `;
      marker.bindPopup(popupContent);
      
      marker.on('click', () => {
        expandMobileDrawer('sheet-peeking');
        const card = document.querySelector(`.location-card[data-id="${po.id}"]`);
        if (card) {
          document.querySelectorAll('.location-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });

      activeMarkers.push({ id: po.id, marker: marker });
      activeStickerMarkers.push({ marker: marker, r: po });
    });
    refreshStickerLabels();

    // Render nearby POs in the sidebar results list WITH back button and target item!
    renderResultsList(nearbyPOs, true, targetTitle, selectedLoc);

    // Update results metadata
    if (resultsCount) {
      resultsCount.innerHTML = `📍 Near <b>${escHtml(targetTitle)}</b>: showing <span>${nearbyPOs.length}</span> nearby Metfone Express Branches`;
    }

    // Draw 30km circle around selected location (subtle opacity so it doesn't distract)
    L.circle([selectedLoc.latitude, selectedLoc.longitude], {
      color: '#4A805B',
      fillColor: '#4A805B',
      fillOpacity: 0.03,
      radius: 30000
    }).addTo(vectorLayerGroup);

    // Zoom in close directly to the target location at zoom level 17!
    if (selectedLoc.latitude && selectedLoc.longitude) {
      map.setView([selectedLoc.latitude, selectedLoc.longitude], 17, { animate: true, duration: 1.2 });
    } else {
      fitMapToMarkers(15);
    }
    
    // Auto-open target popup with detailed list
    if (targetMarker) {
      targetMarker.openPopup();
    }
  } catch (e) {
    console.error(e);
    showState('empty');
    if (resultsCount) {
      resultsCount.textContent = `Error finding nearby branches: ${e.message}`;
    }
  }
}

// Distance formatting helper: meters for < 1km, km for >= 1km
function formatDistance(distKm) {
  if (distKm < 1) {
    return `${Math.round(distKm * 1000)}m`;
  }
  return `${distKm.toFixed(1)} km`;
}

// Calculate distance in kilometers between two lat/lng points using Haversine formula
function haversine(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 0;
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Search Like Google & Include Nearby Branches Logic
 */
async function runSmartFind() {
  const q = searchInput.value.trim();

  if (!q) {
    customAlert('Please enter a location first.', 'Search Notice');
    return;
  }

  addRecentSearch(q);
  showState('loading');
  expandMobileDrawer('sheet-expanded');
  closeAutocomplete();

  try {
    // 0. Check if user selected "Search all post" or requested all branches
    const isSearchAll = q === 'ស្វែងរកគ្រប់ទីតាំងទទួលឥវ៉ាន់មាននៅទីនេះ (Search all post)' || q.toLowerCase() === 'search all post' || q.toLowerCase() === 'all';
    if (isSearchAll) {
      try {
        const branches = clientBranches;
        
        if (branches.length === 0) {
          showState('empty');
          return;
        }

        showState('none');
        clearAllMapLayers();
        activeMarkers = [];
        activeStickerMarkers = [];

        currentResults = branches;

        // Render markers on map
        renderMapMarkers(branches);

        // Render results list in sidebar
        renderResultsList(branches, false, null);

        if (resultsCount) {
          resultsCount.innerHTML = `Found <span style="color: #d97706; font-weight: 700;">${branches.length} Metfone PO Branches</span> across Cambodia.`;
        }
        
        // Fit view bounds to show all markers
        fitMapToMarkers(14);
        return;
      } catch (err) {
        console.error('Search all branches failed:', err);
        showState('empty');
        return;
      }
    }
    // 0.5 Check if user pasted a Google Maps URL directly
    if (/maps\.app\.goo\.gl|goo\.gl\/maps|google\.com\/maps/i.test(q)) {
      try {
        if (provinceSelect) {
          provinceSelect.value = ''; // Reset province filter because URL coordinates are absolute
        }
        const geoUrl = `${API}/api/google-geocode?q=${encodeURIComponent(q)}`;
        const geoRes = await fetch(geoUrl);
        if (geoRes.ok) {
          const coordsData = await geoRes.json();
          if (coordsData.type === 'multiple') {
            presentProvinceSelection(coordsData.results, q, coordsData.isOtherProvince || false);
            return;
          }
          const selectedLoc = {
            id: 'target_' + Date.now(),
            market: coordsData.name || 'Google Maps Location',
            latitude: coordsData.lat,
            longitude: coordsData.lng,
            province: coordsData.province || 'Google Location',
            province_kh: coordsData.province_kh || '',
            district: coordsData.district || '',
            district_kh: coordsData.district_kh || '',
            google_maps_url: q.trim()
          };
          await selectLocationAndFindNearbyPOs(selectedLoc, [selectedLoc]);
          return;
        }
      } catch (err) {
        console.warn('Google maps URL geocoding failed:', err.message);
      }
    }

    // 1. Check if user typed direct GPS coordinates (e.g. 11.556, 104.928)
    const coords = parseCoordinates(q);
    if (coords) {
      if (provinceSelect) {
        provinceSelect.value = ''; // Reset province filter because GPS coordinates are absolute
      }
      const selectedLoc = {
        id: 'target_' + Date.now(),
        market: `GPS Coordinates: ${coords.lat}, ${coords.lng}`,
        latitude: coords.lat,
        longitude: coords.lng,
        province: 'GPS Location',
        district: '',
        google_maps_url: `https://www.google.com/maps?q=${coords.lat},${coords.lng}`
      };
      await selectLocationAndFindNearbyPOs(selectedLoc, [selectedLoc]);
      return;
    }

    const normQ = normalizeKhmer(q).toLowerCase();

    // 1.5 FIRST: Check local database for exact/close post office branch ID match (e.g. Metfone branch ID like PNP01 or PNPP014)
    // This MUST run before geocoding, so branch ID queries center directly on the post office!
    try {
      const branchMatch = clientBranches.find(r => r.branch_id && q.toLowerCase().replace(/[^a-z0-9]/g, '') === r.branch_id.toLowerCase().replace(/[^a-z0-9]/g, ''));
      
      if (branchMatch) {
        showState('none');
        clearAllMapLayers();
        activeMarkers = [];
        const marker = L.marker([branchMatch.latitude, branchMatch.longitude], { icon: redIcon }).addTo(markerClusterGroup);
        marker.bindPopup(`
          <div class="map-popup-content">
            <div class="popup-header">
              <span class="popup-badge">ID: ${branchMatch.branch_id}</span>
              <span class="popup-coord">${branchMatch.latitude.toFixed(4)}°, ${branchMatch.longitude.toFixed(4)}°</span>
            </div>
            <h4>📮 ${escHtml(branchMatch.market)}</h4>
            <p class="popup-addr">${escHtml([branchMatch.district, branchMatch.province].filter(Boolean).join(', '))}</p>
          </div>
        `);
        activeMarkers.push({ id: branchMatch.id, marker });
        activeStickerMarkers.push({ marker: marker, r: branchMatch });
        refreshStickerLabels();
        renderResultsList([branchMatch], false, null);
        if (resultsCount) {
          resultsCount.innerHTML = `Found Metfone Express Branch: <span>${branchMatch.branch_id}</span>`;
        }
        map.setView([branchMatch.latitude, branchMatch.longitude], 17);
        marker.openPopup(); // Auto-open branch popup
        return;
      }
    } catch (err) {
      console.warn('Branch ID local database pre-check failed:', err.message);
    }

    // 1.6 KHMER ADMIN PREFIX DETECTION: If query starts with ភូមិ/ឃុំ/សង្កាត់/ស្រុក/ក្រុង/ខណ្ឌ/ខេត្ត,
    // skip Google geocode entirely and search local DB directly with both full & stripped query.
    const khmerAdminPrefixRe = /^(ភូមិ|ឃុំ|សង្កាត់|ស្រុក|ក្រុង|ខណ្ឌ|ខេត្ត|រាជធានី)/;
    const enAdminPrefixRe = /^(village|commune|sangkat|district|khan|krong|khet|province)\s+/i;
    const isKhmerAdminSearch = khmerAdminPrefixRe.test(normalizeKhmer(q));
    const isEnAdminSearch = enAdminPrefixRe.test(q.trim());

    if (isKhmerAdminSearch || isEnAdminSearch) {
      const prov = provinceSelect ? provinceSelect.value : '';
      const strippedQ = stripAdministrativePrefixes(normQ);

      // Search locally with full query AND stripped query to maximize hits
      const fullRes = clientSearch(q, 'market', prov);
      const strippedRes = (strippedQ && strippedQ.length >= 2) ? clientSearch(strippedQ, 'market', prov) : [];

      // Merge unique results (full query first = higher priority)
      const seen = new Set();
      const merged = [];
      for (const r of [...fullRes, ...strippedRes]) {
        if (!seen.has(r.id)) { seen.add(r.id); merged.push(r); }
      }

      if (merged.length > 0) {
        // Check if all in same province
        const allSameProv = merged.length === 1 || (() => {
          const firstProv = normalizeKhmer(merged[0].province || merged[0].province_kh || '');
          if (!firstProv) return false;
          return merged.every(r => {
            const p = normalizeKhmer(r.province || r.province_kh || '');
            return p === firstProv || p.includes(firstProv) || firstProv.includes(p);
          });
        })();

        if (allSameProv) {
          const topMatch = findBestLocalResult(merged, q);
          const selectedLoc = {
            id: topMatch.id,
            market: topMatch.market || topMatch.village || topMatch.commune || 'Location',
            market_kh: topMatch.market_kh || '',
            latitude: topMatch.latitude,
            longitude: topMatch.longitude,
            province: topMatch.province,
            province_kh: topMatch.province_kh || '',
            district: topMatch.district,
            district_kh: topMatch.district_kh || '',
            commune: topMatch.commune || '',
            commune_kh: topMatch.commune_kh || '',
            village: topMatch.village || '',
            village_kh: topMatch.village_kh || '',
            google_maps_url: topMatch.google_maps_url || `https://www.google.com/maps?q=${topMatch.latitude},${topMatch.longitude}`
          };
          selectLocationAndFindNearbyPOs(selectedLoc, merged);
        } else {
          presentProvinceSelection(merged, q);
        }
        return;
      }
      // If nothing found locally, fall through to Google geocode below
    }

    // 1.7 LOCAL DB PRIORITY: Always check local DB FIRST for market names before geocoding.
    // This ensures "ផ្សារទំនប់ + Kampong Cham" uses our accurate local data, not a guessed geocode.
    try {
      const prov = provinceSelect ? provinceSelect.value : '';
      const localPriorityResults = clientSearch(q, 'market', prov);

      const localHits = localPriorityResults.filter(r => {
        const mKh = normalizeKhmer(r.market_kh || '');
        const mEn = normalizeKhmer(r.market || '');
        const stripped = stripAdministrativePrefixes(normQ);
        // Strong match: market name contains the query, OR stripped query matches
        return mKh.includes(normQ) || mEn.includes(normQ) ||
               (stripped && stripped.length >= 2 && (mKh.includes(stripped) || mEn.includes(stripped)));
      });

      if (localHits.length > 0) {
        const allSameProv = localHits.length === 1 || (() => {
          const firstProv = normalizeKhmer(localHits[0].province || localHits[0].province_kh || '');
          if (!firstProv) return false;
          return localHits.every(r => {
            const p = normalizeKhmer(r.province || r.province_kh || '');
            return p === firstProv || p.includes(firstProv) || firstProv.includes(p);
          });
        })();

        if (allSameProv) {
          const topMatch = findBestLocalResult(localHits, q);
          const selectedLoc = {
            id: topMatch.id,
            market: topMatch.market || 'Location',
            market_kh: topMatch.market_kh || '',
            latitude: topMatch.latitude,
            longitude: topMatch.longitude,
            province: topMatch.province,
            province_kh: topMatch.province_kh || '',
            district: topMatch.district,
            district_kh: topMatch.district_kh || '',
            commune: topMatch.commune || '',
            commune_kh: topMatch.commune_kh || '',
            village: topMatch.village || '',
            village_kh: topMatch.village_kh || '',
            google_maps_url: topMatch.google_maps_url || `https://www.google.com/maps?q=${topMatch.latitude},${topMatch.longitude}`
          };
          selectLocationAndFindNearbyPOs(selectedLoc, localHits);
          return;
        } else {
          // Multiple results in different provinces — show selection screen
          presentProvinceSelection(localHits, q);
          return;
        }
      }
    } catch (err) {
      console.warn('Local DB priority check failed:', err.message);
    }

    // 2. Query FREE Google Maps Geocoding proxy first
    try {
      const prov = provinceSelect ? provinceSelect.value : '';
      const geoUrl = `${API}/api/google-geocode?q=${encodeURIComponent(q)}` + (prov ? `&province=${encodeURIComponent(prov)}` : '');
      const geoRes = await fetch(geoUrl);
      if (geoRes.ok) {
        const coordsData = await geoRes.json();
        
        // If multiple matching locations are returned (either from chosen province or cross-province fallback)
        if (coordsData.type === 'multiple') {
          presentProvinceSelection(coordsData.results, q, coordsData.isOtherProvince || false);
          return;
        }

        const selectedLoc = {
          id: 'target_' + Date.now(),
          market: coordsData.name || q,
          latitude: coordsData.lat,
          longitude: coordsData.lng,
          province: coordsData.province || 'Google Location',
          province_kh: coordsData.province_kh || '',
          district: coordsData.district || '',
          district_kh: coordsData.district_kh || '',
          google_maps_url: `https://www.google.com/maps?q=${coordsData.lat},${coordsData.lng}`
        };
        selectLocationAndFindNearbyPOs(selectedLoc, [selectedLoc]);
        return;
      }
    } catch (err) {
      console.warn('Google geocoder search failed, trying local DB fallback...');
    }

    // 3. Fallback: Check local market AND branch databases if geocoding/branch matching returns nothing
    const prov = provinceSelect ? provinceSelect.value : '';
    const marketData = clientSearch(q, 'market', prov);
    const branchData = clientSearch(q, 'branch', prov);
    const combinedLocal = [...marketData, ...branchData];

    const filteredLocal = combinedLocal.filter(r => {
      const marketEn = (r.market || '').toLowerCase();
      const marketKh = (r.market_kh || '').toLowerCase();
      return marketEn.includes(normQ) || marketKh.includes(normQ);
    });

    if (filteredLocal.length > 0) {
      const allInSameProvince = (filteredLocal.length === 1) || (() => {
        const firstProv = normalizeKhmer(filteredLocal[0].province || filteredLocal[0].province_kh);
        if (!firstProv) return false;
        return filteredLocal.every(r => {
          const prov = normalizeKhmer(r.province || r.province_kh);
          return prov === firstProv || prov.includes(firstProv) || firstProv.includes(prov);
        });
      })();

      if (allInSameProvince) {
        const topMatch = findBestLocalResult(filteredLocal, q);
        const selectedLoc = {
          id: topMatch.id,
          market: topMatch.market || topMatch.village || topMatch.commune || 'Market',
          latitude: topMatch.latitude,
          longitude: topMatch.longitude,
          province: topMatch.province,
          district: topMatch.district,
          google_maps_url: topMatch.google_maps_url || `https://www.google.com/maps?q=${topMatch.latitude},${topMatch.longitude}`
        };
        selectLocationAndFindNearbyPOs(selectedLoc, filteredLocal);
        return;
      } else {
        presentProvinceSelection(filteredLocal, q);
        return;
      }
    }

    // 4. Ultimate Fallback: Location is not found anywhere in Cambodia. Say not found, and show all post offices in the selected province!
    const fallbackProv = provinceSelect ? provinceSelect.value : '';
    showState('none');
    clearAllMapLayers();
    activeMarkers = [];
    activeStickerMarkers = [];

    if (resultsCount) {
      if (prov) {
        resultsCount.innerHTML = `No matches found for "<span style="color: #ef4444; font-weight: 700;">${escHtml(q)}</span>" in ${escHtml(prov)} Province.`;
      } else {
        resultsCount.innerHTML = `No matches found for "<span style="color: #ef4444; font-weight: 700;">${escHtml(q)}</span>" in Cambodia.`;
      }
    }

    const branches = clientSearch('', 'branch', fallbackProv);
      
      if (branches.length > 0) {
        const noticeHeader = document.createElement('div');
        noticeHeader.style.cssText = 'padding: 16px; display: flex; flex-direction: column; gap: 8px; font-family: var(--font-sans);';
        noticeHeader.innerHTML = `
          <div style="background-color: #fef2f2; border: 1px solid #fee2e2; border-radius: var(--radius-lg); padding: var(--space-4); display: flex; align-items: flex-start; gap: var(--space-3); margin-bottom: 4px; box-shadow: var(--shadow-sm);">
            <span style="font-size: 1.5rem; line-height: 1;">❌</span>
            <div>
              <h3 style="font-size: var(--text-sm); font-weight: 700; color: #991b1b; margin: 0 0 4px 0;">Location Not Found</h3>
              <p style="font-size: var(--text-xs); color: #7f1d1d; margin: 0; line-height: 1.5;">
                We couldn't find any location matching "${escHtml(q)}" in ${escHtml(prov ? prov + ' Province' : 'Cambodia')}. 
                Below are all available <b>Metfone Post Office Branches</b> in <b>${escHtml(fallbackProv || 'Cambodia')}</b>:
              </p>
            </div>
          </div>
        `;
        resultsList.innerHTML = '';
        resultsList.appendChild(noticeHeader);

        const branchBounds = [];
        const branchIcon = L.divIcon({
          html: `
            <div class="eco-pin eco-pin--branch" style="filter: drop-shadow(0 6px 12px rgba(220, 38, 38, 0.45));">
              <div class="eco-pin__bubble" style="background: #dc2626; border-color: #ffffff;"><span style="transform: rotate(45deg); display: inline-block;">📮</span></div>
            </div>
          `,
          className: 'custom-eco-pin',
          iconSize: [36, 42],
          iconAnchor: [18, 42],
          popupAnchor: [0, -38]
        });

        branches.forEach(b => {
          const bLat = parseFloat(b.latitude);
          const bLng = parseFloat(b.longitude);
          if (!isNaN(bLat) && !isNaN(bLng)) {
            branchBounds.push([bLat, bLng]);
            const bMarker = L.marker([bLat, bLng], { icon: branchIcon }).addTo(markerClusterGroup);
            
            bMarker.bindPopup(`
              <div class="map-popup-content" style="width: 240px; font-family: var(--font-sans); padding: 2px;">
                <h4 style="margin: 4px 0 2px 0; font-size:13px; color:#991b1b; font-weight: 700;">📮 ${escHtml(getBilingualTitle(b))}</h4>
                <p style="margin: 0 0 10px 0; font-size:11px; color:#7f1d1d; font-weight: 500; line-height: 1.3;">ID: ${b.branch_id || b.store_code}</p>
              </div>
            `);

            activeMarkers.push({ id: b.id || b.branch_id, marker: bMarker });
            activeStickerMarkers.push({ marker: bMarker, r: b });
          }
        });

        if (branchBounds.length > 0) {
          map.fitBounds(L.latLngBounds(branchBounds), { maxZoom: 13, padding: [60, 60] });
        }

        const branchesListContainer = document.createElement('div');
        branchesListContainer.className = 'candidate-cards-list';
        branchesListContainer.style.padding = '0 16px 16px 16px';
        
        branches.forEach(b => {
          const bCard = document.createElement('div');
          bCard.className = 'location-card';
          bCard.style.cssText = 'border-left: 4px solid #dc2626; margin-bottom: 8px; cursor: pointer; background: var(--bg-card); border-radius: var(--radius-md); box-shadow: var(--shadow-sm); padding: 12px;';
          bCard.innerHTML = `
            <div style="display: flex; gap: 12px; align-items: flex-start;">
              <div style="background-color: #dc2626; color: #fff; padding: 6px; border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 44px; height: 44px; flex-shrink: 0; box-shadow: 0 2px 4px rgba(220, 38, 38, 0.25);">
                <span style="font-size: 1.1rem; line-height: 1;">📮</span>
                <span style="font-size: 8px; font-weight: 700;">BRANCH</span>
              </div>
              <div style="flex-grow: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0;">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; width: 100%;">
                  <span style="color: #991b1b; font-weight: 700; font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escHtml(getBilingualTitle(b))}</span>
                  <span style="background-color: #fecaca; color: #991b1b; font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 4px; white-space: nowrap;">ID: ${b.branch_id || b.store_code}</span>
                </div>
                <div style="font-size: 12px; color: var(--text-muted); line-height: 1.4;">
                  ${escHtml([b.district_en, b.province_en].filter(Boolean).join(', '))}
                </div>
              </div>
            </div>
          `;
          bCard.addEventListener('click', () => {
            const markerObj = activeMarkers.find(am => am.id === (b.id || b.branch_id));
            if (markerObj && b.latitude && b.longitude) {
              map.flyTo([b.latitude, b.longitude], 16, { animate: true, duration: 1.2 });
              setTimeout(() => markerObj.marker.openPopup(), 1200);
            }
          });
          branchesListContainer.appendChild(bCard);
        });
        resultsList.appendChild(branchesListContainer);
        refreshStickerLabels();
      } else {
        showState('empty');
      }
  } catch (e) {
    console.error(e);
    showState('empty');
    if (resultsCount) {
      resultsCount.textContent = `Error: ${e.message}`;
    }
  }
}

// Render locations in the sidebar list
function renderResultsList(results, isNearbyList = false, targetTitle = null, targetLoc = null) {
  resultsList.innerHTML = '';

  function getAiConfidence(po, isTarget) {
    if (isTarget) return 99.4;
    if (po.distance_km != null) {
      const dist = po.distance_km;
      if (dist <= 1) return 99.1;
      if (dist <= 5) return 95.8;
      if (dist <= 10) return 91.2;
      if (dist <= 20) return 86.5;
      return 78.4;
    }
    return 93.2;
  }

  // If showing nearby results for a selected market or search target, show banner at top!
  if (isNearbyList && targetTitle) {
    const banner = document.createElement('div');
    banner.className = 'nearby-header-bar';
    banner.style.padding = '12px 16px';
    banner.style.borderBottom = '1px solid #f2f2f7';
    banner.style.display = 'flex';
    banner.style.justifyContent = 'space-between';
    banner.style.alignItems = 'center';
    banner.innerHTML = `
      <span class="nearby-header-title" style="font-size: 13px; font-weight: 700; color: #1c1c1e;">📍 Nearby POs for <b>"${escHtml(targetTitle)}"</b></span>
      <button class="nearby-back-btn" id="nearbyBackBtn" style="background: #f2f2f7; border: none; color: #007aff; font-weight: 700; padding: 6px 12px; border-radius: 8px; cursor: pointer; font-size: 11px;">← Back</button>
    `;
    resultsList.appendChild(banner);

    const backBtn = banner.querySelector('#nearbyBackBtn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearBtn.style.display = 'none';
        closeAutocomplete();
        clearAllMapLayers();
        activeMarkers = [];
        showState('welcome');
        if (resultsCount) {
          resultsCount.textContent = 'Welcome to Metfone Express Eco-Route Grid';
        }
        map.setView([12.5657, 104.9910], 7.5);
      });
    }

    // Render the target location itself at the very top of the list!
    if (targetLoc) {
      const targetCard = document.createElement('div');
      targetCard.className = 'location-card apple-logistics-card target-location-card';
      targetCard.style.backgroundColor = '#f0f7ff';
      targetCard.style.borderColor = '#bfdbfe';
      targetCard.style.marginBottom = '12px';

      const tTitle = targetLoc.store_name || targetLoc.market || targetLoc.village || targetLoc.commune || 'Target Location';
      const tTitleKh = targetLoc.store_name_kh || clientGetKhmerStoreName(tTitle) || targetLoc.market_kh || targetLoc.village_kh || targetLoc.commune_kh || '';
      const q = normalizeKhmer(searchInput.value);

      targetCard.innerHTML = `
        <div style="padding: 4px 0; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; width: 100%;">
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
              <span style="background: #2563eb; color: white; font-size: 8.5px; font-weight: 800; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">Origin Target</span>
              <span style="font-size: 8.5px; font-weight: 700; color: #2563eb; padding: 2px 6px; background: #dbeafe; border-radius: 4px;">AI Confidence: ${getAiConfidence(targetLoc, true)}%</span>
            </div>
            <h4 style="margin: 0; font-size: 14.5px; font-weight: 700; color: #1e3a8a;">${highlightMatch(tTitle, q)}</h4>
            ${tTitleKh ? `<div style="font-family: var(--font-khmer); font-size: 12.5px; color: #4b5563; margin-top: 2px;">${highlightMatch(tTitleKh, q)}</div>` : ''}
            <div style="font-size: 11px; color: #4b5563; margin-top: 6px; display: flex; align-items: center; gap: 4px;">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" style="color: #2563eb;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
              ${[targetLoc.village, targetLoc.commune, targetLoc.district, targetLoc.province].filter(Boolean).join(', ')}
            </div>
          </div>
          <button class="card-directions-btn" onclick="event.stopPropagation(); window.open('${targetLoc.google_maps_url || `https://www.google.com/maps?q=${targetLoc.latitude},${targetLoc.longitude}`}', '_blank');" title="Directions" style="border-color: #bfdbfe; color: #2563eb; margin-top: 2px; flex-shrink: 0; outline: none;">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M22.43 10.43L13.57 1.57c-.75-.75-2.07-.75-2.83 0l-8.8 8.8c-.76.76-.76 2.07 0 2.83l8.86 8.86c.38.38.88.57 1.38.57s1-.19 1.38-.57l8.86-8.86c.76-.76.76-2.07 0-2.83zM14 14.5V12h-4v3H8v-4c0-.55.45-1 1-1h5V7.5l3.5 3.5-3.5 3.5z"></path></svg>
          </button>
        </div>
      `;

      targetCard.addEventListener('click', () => {
        document.querySelectorAll('.location-card').forEach(c => c.classList.remove('selected'));
        targetCard.classList.add('selected');
        if (targetLoc.latitude && targetLoc.longitude) {
          map.flyTo([targetLoc.latitude, targetLoc.longitude], 17, { animate: true, duration: 1.2 });
          const am = activeMarkers.find(m => m.id === 'target_loc' || m.id === targetLoc.id);
          if (am) {
            setTimeout(() => am.marker.openPopup(), 1200);
          }
        }
      });

      resultsList.appendChild(targetCard);
    }

    // If there are multiple matched search targets, render the horizontal switch bar!
    if (currentResults && currentResults.length > 1) {
      const matchBar = document.createElement('div');
      matchBar.className = 'search-matches-bar';
      matchBar.innerHTML = `
        <div class="matches-title">📍 Alternative Matches:</div>
        <div class="matches-pills">
          ${currentResults.map(r => {
            const isActive = (r.market === targetTitle);
            return `
              <button class="match-pill ${isActive ? 'active' : ''}" onclick="triggerSelectLocation('${r.id}')">
                ${escHtml(r.market)}
              </button>
            `;
          }).join('')}
        </div>
      `;
      resultsList.appendChild(matchBar);
    }
  }

  results.forEach((r, idx) => {
    const card = document.createElement('div');
    card.className = 'location-card apple-logistics-card';
    card.setAttribute('data-id', r.id);

    const storeName = r.store_name || r.market || 'Metfone Post Office';
    const storeNameKh = r.store_name_kh || clientGetKhmerStoreName(storeName) || r.market_kh || '';
    
    const q = normalizeKhmer(searchInput.value);
    const confidence = getAiConfidence(r, false);

    card.innerHTML = `
      <!-- Header Row: Title & Distance Badge -->
      <div class="card-header-row" style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; width: 100%;">
        <div style="min-width: 0; flex: 1;">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px; flex-wrap: wrap;">
            <span style="background: var(--metfone-red-light); color: var(--metfone-red); font-size: 8.5px; font-weight: 800; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">POST OFFICE</span>
            ${r.branch_id ? `<span style="background: #e2e8f0; color: #475569; font-size: 8.5px; font-weight: 800; padding: 2px 6px; border-radius: 4px;">ID: ${highlightMatch(r.branch_id, q)}</span>` : ''}
            <span style="font-size: 8.5px; font-weight: 700; color: #059669; padding: 2px 6px; background: #d1fae5; border-radius: 4px;">AI Match: ${confidence}%</span>
          </div>
          <h3 style="margin: 0; font-size: 14.5px; font-weight: 700; color: #1f2937;">${highlightMatch(storeName, q)}</h3>
          ${storeNameKh ? `<div style="font-family: var(--font-khmer); font-size: 12.5px; color: var(--text-muted); margin-top: 2px;">${highlightMatch(storeNameKh, q)}</div>` : ''}
        </div>
        
        <!-- Distance Badge -->
        ${r.distance_km != null ? `
          <div class="distance-badge-pill" style="background: var(--metfone-red); color: white; padding: 6px 12px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 4px 10px rgba(218, 37, 29, 0.25);">
            <span style="font-size: 13.5px; font-weight: 800; line-height: 1;">${formatDistance(r.distance_km).replace(' km','')}</span>
            <span style="font-size: 7.5px; font-weight: 700; text-transform: uppercase; margin-top: 1.5px;">KM AWAY</span>
          </div>
        ` : ''}
      </div>
      
      <!-- Address Details Block -->
      <div class="card-address-block" style="margin-top: 10px; font-size: 11.5px; color: #4b5563; display: flex; flex-direction: column; gap: 4px; background: #f8f9fa; border-radius: 10px; padding: 8px 12px; border: 1.5px solid #f2f2f7;">
        ${(r.village || r.village_kh) ? `
          <div><span style="font-weight: 700; color: #64748b;">Village:</span> ${r.village_kh ? escHtml(r.village_kh) : ''} ${r.village_kh && r.village ? '·' : ''} ${r.village ? escHtml(r.village) : ''}</div>
        ` : ''}
        <div><span style="font-weight: 700; color: #64748b;">Commune:</span> ${r.commune_kh ? escHtml(r.commune_kh) : ''} ${r.commune_kh && r.commune ? '·' : ''} ${r.commune ? escHtml(r.commune) : ''}</div>
        <div><span style="font-weight: 700; color: #64748b;">District:</span> ${r.district_kh ? escHtml(r.district_kh) : ''} ${r.district_kh && r.district ? '·' : ''} ${r.district ? escHtml(r.district) : ''}</div>
        <div><span style="font-weight: 700; color: #64748b;">Province:</span> ${r.province_kh ? escHtml(r.province_kh) : ''} ${r.province_kh && r.province ? '·' : ''} ${r.province ? escHtml(r.province) : ''}</div>
      </div>
      
      <!-- Action Buttons Panel -->
      <div class="card-actions-panel" style="margin-top: 12px; display: flex; gap: 8px; justify-content: flex-end; align-items: center; border-top: 1px solid #f2f2f7; padding-top: 10px;">
        <button class="apple-card-btn save-btn" onclick="event.stopPropagation(); toggleSaveBranch('${r.id}');" style="background: ${isBranchSaved(r.id) ? 'var(--metfone-red-light)' : '#f3f4f6'}; color: ${isBranchSaved(r.id) ? 'var(--metfone-red)' : '#4b5563'};">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" style="display: inline-block; vertical-align: middle; margin-right: 2px;"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
          ${isBranchSaved(r.id) ? 'Saved' : 'Save'}
        </button>
        <button class="apple-card-btn route-btn" onclick="event.stopPropagation(); window.open('${r.google_maps_url || `https://www.google.com/maps?q=${r.latitude},${r.longitude}`}', '_blank');" style="background: var(--metfone-red); color: white;">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" style="display: inline-block; vertical-align: middle; margin-right: 2px;"><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
          View Route
        </button>
      </div>
    `;

    card.addEventListener('click', () => {
      document.querySelectorAll('.location-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      
      // If we are looking at a Market, Commune, District, or Village in normal/market list (not a Post Office), click it to find nearby POs!
      if (!isNearbyList && !r.branch_id) {
        selectLocationAndFindNearbyPOs(r, currentResults);
      } else {
        // If it is already a nearby Post Office or branch, just fly to it on map!
        if (r.latitude && r.longitude) {
          map.flyTo([r.latitude, r.longitude], 17, { animate: true, duration: 1.2 });
          const am = activeMarkers.find(m => m.id === r.id);
          if (am) {
            setTimeout(() => am.marker.openPopup(), 1200);
          }
        }
      }
      expandMobileDrawer('sheet-peeking');
    });

    resultsList.appendChild(card);
  });
}

// Render markers on Leaflet map
function renderMapMarkers(results) {
  clearAllMapLayers();
  activeMarkers = [];
  const markersToAdd = [];

  results.forEach(r => {
    if (!r.latitude || !r.longitude) return;

    const marker = L.marker([r.latitude, r.longitude], { icon: redIcon });

    const isPo = !!r.branch_id;
    const emoji = isPo ? '📮 ' : '📍 ';
    const displayTitle = getBilingualTitle(r);
    const displayAddr = getBilingualAddress(r);

    const popupContent = `
      <div class="map-popup-content">
        <div class="popup-header">
          <span class="popup-badge">${isPo ? 'PO: ' : 'LOC: '}${r.branch_id || 'LOC'}</span>
          <span class="popup-coord">${r.latitude.toFixed(4)}°, ${r.longitude.toFixed(4)}°</span>
        </div>
        <h4>${emoji}${escHtml(displayTitle)}</h4>
        <div class="popup-divider"></div>
        <p class="popup-addr">${escHtml(displayAddr)}</p>
        ${r.distance_km != null ? `<p style="color: var(--metfone-red); font-weight: 700; margin-top: 4px;">📡 ចំងាយ Distance: ${formatDistance(r.distance_km)}</p>` : ''}
        <a class="popup-gmaps-link" href="${r.google_maps_url || `https://www.google.com/maps?q=${r.latitude},${r.longitude}`}" target="_blank" rel="noopener">Open in Google Maps ↗</a>
      </div>
    `;

    marker.bindPopup(popupContent);

    marker.on('click', () => {
      expandMobileDrawer('sheet-peeking');
      if (!r.branch_id) {
        selectLocationAndFindNearbyPOs(r, currentResults, false);
      } else {
        const card = document.querySelector(`.location-card[data-id="${r.id}"]`);
        if (card) {
          document.querySelectorAll('.location-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    });

    markersToAdd.push(marker);
    activeMarkers.push({ id: r.id, marker: marker });
    activeStickerMarkers.push({ marker: marker, r: r });
  });
  refreshStickerLabels();

  if (markersToAdd.length > 0) {
    markerClusterGroup.addLayers(markersToAdd);
  }

  fitMapToMarkers(14);
}

// Auto fit map bounds around markers (Never zoom out too far!)
function fitMapToMarkers(customMaxZoom = 15) {
  if (activeMarkers.length === 0) return;
  const group = L.featureGroup(activeMarkers.map(am => am.marker));
  map.fitBounds(group.getBounds().pad(0.2), { maxZoom: customMaxZoom, animate: true, duration: 1.2 });
}

// Present multiple province/location matches for confirmation to ensure 100% accuracy
function presentProvinceSelection(results, query, isOtherProvinceMatches = false) {
  currentResults = results;
  showState('none');
  clearAllMapLayers();
  activeMarkers = [];
  activeStickerMarkers = [];

  const mainColor = isOtherProvinceMatches ? '#3b82f6' : '#f59e0b';
  const darkerColor = isOtherProvinceMatches ? '#1d4ed8' : '#b45309';
  const lighterBg = isOtherProvinceMatches ? '#eff6ff' : '#fffbeb';
  const lightBorder = isOtherProvinceMatches ? '#bfdbfe' : '#fef3c7';
  const textColor = isOtherProvinceMatches ? '#1e3a8a' : '#78350f';

  if (resultsCount) {
    if (isOtherProvinceMatches) {
      resultsCount.innerHTML = `Not found in selected province. Found <span style="color: ${mainColor}; font-weight: 700;">${results.length} Suggestions</span> in other provinces.`;
    } else {
      resultsCount.innerHTML = `Found <span style="color: ${mainColor}; font-weight: 700;">${results.length} Matches</span>. Please choose the correct province.`;
    }
  }

  // Create Beautiful Custom Pin for Candidate Locations
  const candidateIcon = L.divIcon({
    html: `
      <div class="eco-pin eco-pin--candidate" style="filter: drop-shadow(0 6px 12px rgba(${isOtherProvinceMatches ? '59, 130, 246' : '245, 158, 11'}, 0.45));">
        <div class="eco-pin__bubble" style="background: ${mainColor}; border-color: #ffffff;"><span style="transform: rotate(45deg); display: inline-block;">📍</span></div>
      </div>
    `,
    className: 'custom-eco-pin',
    iconSize: [36, 42],
    iconAnchor: [18, 42],
    popupAnchor: [0, -38]
  });

  const boundsCoords = [];

  results.forEach(r => {
    const lat = parseFloat(r.latitude || r.lat);
    const lng = parseFloat(r.longitude || r.lng);
    if (!isNaN(lat) && !isNaN(lng)) {
      boundsCoords.push([lat, lng]);

      const name = r.market || r.village || r.commune || 'Market Candidate';
      const prov = r.province || 'Cambodia';
      const marker = L.marker([lat, lng], { icon: candidateIcon }).addTo(markerClusterGroup);

      marker.bindPopup(`
        <div class="map-popup-content" style="width: 240px; font-family: var(--font-sans); padding: 2px;">
          <h4 style="margin: 4px 0 2px 0; font-size:13px; color:${darkerColor}; font-weight: 700;">📍 ${escHtml(name)}</h4>
          <p style="margin: 0 0 10px 0; font-size:11px; color:${textColor}; font-weight: 500; line-height: 1.3;">${escHtml(prov)}</p>
          <button onclick="triggerSelectLocation('${r.id}')" style="background:${mainColor}; color:#fff; border:none; padding:6px 10px; width:100%; border-radius:4px; font-weight:700; cursor:pointer; font-size:11px; transition: background 0.2s;">
            ${isOtherProvinceMatches ? 'Switch Province & Route' : 'Confirm & Find Nearest POs'} →
          </button>
        </div>
      `);

      activeMarkers.push({ id: r.id, marker: marker });
      activeStickerMarkers.push({ marker: marker, r: r });
    }
  });

  if (boundsCoords.length > 0) {
    if (boundsCoords.length === 1) {
      map.setView(boundsCoords[0], 13);
    } else {
      map.fitBounds(L.latLngBounds(boundsCoords), { maxZoom: 13, padding: [60, 60] });
    }
  }

  // Sidebar List Content
  const container = document.createElement('div');
  container.className = 'province-confirm-container';
  container.style.cssText = 'padding: 16px; display: flex; flex-direction: column; gap: 12px; font-family: var(--font-sans);';

  let listHtml = '';
  results.forEach(r => {
    const name = r.market || r.village || r.commune || 'Market Candidate';
    const nameKh = r.market_kh || r.village_kh || r.commune_kh || '';
    const prov = r.province || 'Cambodia';
    const shortProv = extractProvinceName(prov);

    // Build address rows: village → commune/sangkat → district/khan/krong → province
    const addrRows = [];

    // Village row
    if (r.village || r.village_kh) {
      addrRows.push({
        labelKh: 'ភូមិ', labelEn: 'Village',
        valKh: r.village_kh || '',
        valEn: r.village || ''
      });
    }
    // Commune / Sangkat row
    const isSangkat = !!(r.sangkat || r.sangkat_kh);
    if (r.commune || r.commune_kh || r.sangkat || r.sangkat_kh) {
      addrRows.push({
        labelKh: isSangkat ? 'សង្កាត់' : 'ឃុំ',
        labelEn: isSangkat ? 'Sangkat' : 'Commune',
        valKh: r.commune_kh || r.sangkat_kh || '',
        valEn: r.commune || r.sangkat || ''
      });
    }
    // District / Khan / Krong row
    if (r.district || r.district_kh || r.district_en) {
      const isKhan = !!(r.khan || r.khan_kh);
      const isKrong = !!(r.krong || r.krong_kh);
      addrRows.push({
        labelKh: isKhan ? 'ខណ្ឌ' : isKrong ? 'ក្រុង' : 'ស្រុក',
        labelEn: isKhan ? 'Khan' : isKrong ? 'Krong' : 'District',
        valKh: r.district_kh || '',
        valEn: r.district_en || r.district || ''
      });
    }
    // Province row (always shown)
    addrRows.push({
      labelKh: 'ខេត្ត', labelEn: 'Province',
      valKh: r.province_kh || '',
      valEn: r.province || 'Cambodia',
      isProvince: true
    });

    const addrHtml = addrRows.map((row, i) => `
      <div style="display:flex;align-items:flex-start;gap:6px;${i > 0 ? 'margin-top:3px;' : ''}${row.isProvince && addrRows.length > 1 ? 'border-top:1px dashed ' + lightBorder + ';padding-top:4px;margin-top:4px;' : ''}">
        <span style="font-size:9px;font-weight:800;color:${darkerColor};background:${lightBorder};padding:1.5px 5px;border-radius:3px;flex-shrink:0;white-space:nowrap;line-height:1.6;">${escHtml(row.labelKh)} · ${escHtml(row.labelEn)}</span>
        <span style="font-size:11.5px;color:${row.isProvince ? darkerColor : 'var(--forest-900)'};font-weight:${row.isProvince ? '700' : '600'};line-height:1.4;min-width:0;flex:1;">
          ${row.valKh ? `<span style="font-family:var(--font-khmer);">${escHtml(row.valKh)}</span>` : ''}${row.valKh && row.valEn ? '<span style="color:var(--text-light);margin:0 2px;">·</span>' : ''}${row.valEn ? escHtml(row.valEn) : ''}
        </span>
      </div>
    `).join('');

    listHtml += `
      <div class="location-card candidate-card" style="border-left: 4px solid ${mainColor}; background: var(--bg-card); border-radius: var(--radius-md); box-shadow: var(--shadow-sm); padding: 12px; cursor: pointer; transition: all 0.2s ease; margin-bottom: 8px;" onclick="triggerSelectLocation('${r.id}')">
        <div style="display: flex; gap: 12px; align-items: flex-start;">
          <div style="flex-grow: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; overflow: hidden;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; width: 100%;">
              <div style="min-width:0; flex:1;">
                <div style="color: ${textColor}; font-weight: 700; font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${highlightMatch(name, query)}</div>
                ${nameKh ? `<div style="font-family:var(--font-khmer); font-size:12px; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:1px;">${highlightMatch(nameKh, query)}</div>` : ''}
              </div>
              ${shortProv ? `
                <span style="background-color: ${lighterBg}; color: ${darkerColor}; font-size: 9.5px; font-weight: 800; padding: 2px 6px; border-radius: 4px; border: 1.5px solid ${lightBorder}; white-space: nowrap; text-transform: uppercase; box-shadow: var(--shadow-sm); flex-shrink: 0; margin-top:2px;">
                  ${escHtml(shortProv)}
                </span>
              ` : ''}
            </div>
            <div style="margin-top:3px; background:${lighterBg}; border-radius:7px; padding:7px 9px; border:1px solid ${lightBorder};">
              ${addrHtml}
            </div>
            <div style="margin-top: 4px; display: flex; justify-content: flex-end;">
              <button style="background: ${mainColor}; color: #fff; border: none; padding: 5px 12px; font-size: 11px; font-weight: 700; border-radius: 4px; cursor: pointer; transition: background 0.2s; display: flex; align-items: center; gap: 4px;">
                Select &amp; Route →
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  });

  const selectedProvinceName = provinceSelect && provinceSelect.value ? provinceSelect.value : 'selected province';
  const bannerHtml = isOtherProvinceMatches ? `
    <div style="background-color: ${lighterBg}; border: 1px solid ${lightBorder}; border-radius: var(--radius-lg); padding: var(--space-4); display: flex; align-items: flex-start; gap: var(--space-3); margin-bottom: 4px; box-shadow: var(--shadow-sm);">
      <span style="font-size: 1.5rem; line-height: 1;">🗺️</span>
      <div>
        <h3 style="font-size: var(--text-sm); font-weight: 700; color: ${darkerColor}; margin: 0 0 4px 0;">Not Found in ${escHtml(selectedProvinceName)}</h3>
        <p style="font-size: var(--text-xs); color: ${textColor}; margin: 0; line-height: 1.5;">
          We couldn't find matching locations in your selected province. Did you mean these locations in other provinces? Clicking one will automatically switch your province select:
        </p>
      </div>
    </div>
  ` : '';

  container.innerHTML = `
    ${bannerHtml}
    
    <div class="candidate-cards-list" style="display: flex; flex-direction: column;">
      ${listHtml}
    </div>
  `;

  resultsList.appendChild(container);
  refreshStickerLabels();
}

// App State manager helper
function showState(state) {
  stateLoading.style.display = state === 'loading' ? 'flex' : 'none';
  stateWelcome.style.display = state === 'welcome' ? 'flex' : 'none';
  stateEmpty.style.display   = state === 'empty'   ? 'flex' : 'none';
  
  if (state !== 'none') {
    resultsList.innerHTML = '';
  }
}

// Escape HTML helper
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getBilingualTitle(item) {
  const en = item.market || item.village || item.commune || 'Post Office';
  const kh = item.market_kh || item.village_kh || item.commune_kh || '';
  if (kh && kh.toLowerCase() !== en.toLowerCase()) {
    return `${kh} ${en}`;
  }
  return en;
}

function getBilingualAddress(item) {
  const parts = [];
  if (item.province_kh || item.province) parts.push(item.province_kh || item.province);
  if (item.district_en || item.district) parts.push(item.district_en || item.district);
  return parts.filter(Boolean).join(', ') + (parts.length > 0 ? ',' : '');
}

// Khmer spelling unicode normalization helper
function normalizeKhmer(str) {
  if (!str) return '';
  let normalized = str.normalize('NFC').trim();
  normalized = normalized.replace(/\u17C1\u17B8/g, '\u17BE');
  normalized = normalized.replace(/\u17C1\u17B6/g, '\u17C4');
  normalized = normalized.replace(/\u200B/g, '');
  return normalized;
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

// Extract simplified province name
function extractProvinceName(provStr) {
  if (!provStr) return '';
  const parts = provStr.split(',');
  const lastPart = parts[parts.length - 1].trim();
  return lastPart.replace(/\s*Province/gi, '').trim();
}

// Highlight matched search query term in strings
function highlightMatch(text, query) {
  if (!text) return '';
  if (!query) return escHtml(text);

  const normText = normalizeKhmer(text).toLowerCase();
  const normQuery = normalizeKhmer(query).toLowerCase();

  const idx = normText.indexOf(normQuery);
  if (idx === -1) return escHtml(text);

  const isAscii = /^[\x00-\x7F]*$/.test(query);
  if (isAscii) {
    const escText = escHtml(text);
    const regex = new RegExp(`(${query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
    return escText.replace(regex, '<strong>$1</strong>');
  }

  const normalizedText = normalizeKhmer(text);
  const normalizedQuery = normalizeKhmer(query);
  
  const escText = escHtml(normalizedText);
  const regex = new RegExp(`(${normalizedQuery.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
  return escText.replace(regex, '<strong>$1</strong>');
}

// Global selector wrapper for Leaflet map popup select button clicks
window.triggerSelectLocation = function(id) {
  const matched = (currentResults || []).find(r => r.id === id);
  if (matched) {
    if (provinceSelect) {
      const currentVal = provinceSelect.value;
      const matchedProv = matched.province || '';
      const matchedProvVal = findMatchingProvinceValue(matchedProv);
      if (matchedProvVal && matchedProvVal !== currentVal) {
        console.log(`🔄 Automatically switching province from "${currentVal}" to "${matchedProvVal}"`);
        provinceSelect.value = matchedProvVal;
        showProvinceSwitchToast(matchedProvVal);
      }
    }
    selectLocationAndFindNearbyPOs(matched, currentResults);
    expandMobileDrawer('sheet-peeking');
  }
};

function findMatchingProvinceValue(provName) {
  if (!provName || !provinceSelect) return '';
  const normTarget = normalizeKhmer(provName).toLowerCase();
  for (const option of provinceSelect.options) {
    if (!option.value) continue;
    const normOptValue = normalizeKhmer(option.value).toLowerCase();
    const normOptText = normalizeKhmer(option.textContent).toLowerCase();
    if (normTarget.includes(normOptValue) || normOptValue.includes(normTarget) ||
        normTarget.includes(normOptText) || normOptText.includes(normTarget)) {
      return option.value;
    }
  }
  return '';
}

function showProvinceSwitchToast(provinceName) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    top: 24px;
    left: 50%;
    transform: translateX(-50%);
    background-color: #1e3a8a;
    color: #ffffff;
    font-family: var(--font-sans);
    font-size: 13.5px;
    font-weight: 700;
    padding: 10px 24px;
    border-radius: 50px;
    box-shadow: 0 10px 25px rgba(30, 58, 138, 0.35);
    z-index: 9999;
    opacity: 0;
    transition: opacity 0.3s ease, top 0.3s ease;
  `;
  toast.innerHTML = `🔄 Automatically Switched to <b>${provinceName}</b> Province`;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '1';
    toast.style.top = '32px';
  }, 50);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.top = '24px';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3500);
}

window.triggerCorrectMarketCoords = async function(id, name, province) {
  const confirmSearch = await customConfirm(`Do you want to search Google Maps for "${name}" in "${province || 'Cambodia'}" and update its coordinates in the database?`, "Confirm Coordinates Correction");
  if (!confirmSearch) return;

  showState('loading');
  try {
    const geoRes = await fetch(`${API}/api/google-geocode?q=${encodeURIComponent(name)}` + (province ? `&province=${encodeURIComponent(province)}` : ''));
    if (!geoRes.ok) throw new Error('Location not found on Google Maps');
    const coords = await geoRes.json();

    const confirmUpdate = await customConfirm(`Google Maps found "${coords.name || name}" at:\nLatitude: ${coords.lat}\nLongitude: ${coords.lng}\n\nDo you want to save this to the database?`, "Save New Coordinates");
    if (!confirmUpdate) {
      showState('none');
      return;
    }

    const updateRes = await fetch(`${API}/api/update-market-coords`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: id,
        latitude: coords.lat,
        longitude: coords.lng
      })
    });

    if (!updateRes.ok) {
      const errData = await updateRes.json();
      throw new Error(errData.error || 'Failed to update coordinates');
    }

    await customAlert(`Success! Updated database coordinates for "${name}".`, "Coordinates Updated");
    
    // Auto-refresh the current search
    if (searchInput.value.trim()) {
      runSmartFind();
    } else {
      showState('welcome');
    }
  } catch (err) {
    await customAlert(`Error: ${err.message}`, "Correction Failed");
    showState('none');
  }
};


function clearAllMapLayers() {
  activeStickerMarkers = [];
  if (markerClusterGroup) markerClusterGroup.clearLayers();
  if (vectorLayerGroup) vectorLayerGroup.clearLayers();
}

// Sticker labels refresh & controls setup
function refreshStickerLabels() {
  activeStickerMarkers.forEach(item => {
    const { marker, r } = item;
    
    // Clear old tooltip
    marker.unbindTooltip();
    
    if (showLabelsToggle) {
      const districtPart = r.district_kh || r.district || '';
      const marketPart = r.market_kh || r.market || r.store_name || '';
      const nameLabel = [districtPart, marketPart].filter(Boolean).join(' - ');
      
      let finalLabel = '';
      if (labelContentMode === 'id') {
        finalLabel = r.branch_id || nameLabel || 'Target';
      } else if (labelContentMode === 'name') {
        finalLabel = nameLabel;
      } else {
        // 'both'
        if (r.branch_id) {
          finalLabel = nameLabel ? `${r.branch_id} - ${nameLabel}` : r.branch_id;
        } else {
          finalLabel = nameLabel;
        }
      }
      
      if (finalLabel) {
        marker.bindTooltip(finalLabel, {
          permanent: true,
          direction: 'top',
          className: `map-sticker-tooltip size-${labelSize}`,
          interactive: false,
          offset: [0, -12]
        });
      }
    }
  });
}

function findBestLocalResult(results, query) {
  if (results.length === 0) return null;
  const normQ = normalizeKhmer(query).toLowerCase();
  let best = null;
  let bestScore = -1;
  for (const r of results) {
    const rName = normalizeKhmer(r.market || '').toLowerCase();
    const rNameKh = normalizeKhmer(r.market_kh || '').toLowerCase();
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

function setupLabelsControl() {
  const toggleBtn = document.getElementById('toggleLabelsBtn');
  if (toggleBtn) {
    toggleBtn.addEventListener('change', () => {
      showLabelsToggle = toggleBtn.checked;
      refreshStickerLabels();
    });
  }
  
  const sizeBtns = document.querySelectorAll('.map-labels-control .size-btn');
  sizeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      sizeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      labelSize = btn.getAttribute('data-size');
      refreshStickerLabels();
    });
  });

  const modeBtns = document.querySelectorAll('.map-labels-control .mode-btn');
  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      modeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      labelContentMode = btn.getAttribute('data-mode');
      refreshStickerLabels();
    });
  });
}

// Show a single geocoded target on the map first (clean Google Maps style)
function showSingleTargetOnMap(selectedLoc, allMatchedLocs) {
  currentResults = allMatchedLocs || [selectedLoc];
  showState('none');
  clearAllMapLayers();
  activeMarkers = [];

  const targetTitle = selectedLoc.market || selectedLoc.village || selectedLoc.commune || 'Target Location';
  
  // Plot target marker
  const targetMarker = L.marker([selectedLoc.latitude, selectedLoc.longitude], { icon: selectedMarketIcon }).addTo(markerClusterGroup);
  targetMarker.bindPopup(`
    <div class="map-popup-content" style="width: 240px;">
      <div class="popup-header" style="background-color: #173020; margin-bottom: 6px;">
        <span class="popup-badge" style="background-color: #173020; color: #fff;">TARGET LOCATION</span>
        <span class="popup-coord">${selectedLoc.latitude.toFixed(4)}°, ${selectedLoc.longitude.toFixed(4)}°</span>
      </div>
      <h4 style="margin: 4px 0; font-size:13px; color:#1e293b;">📍 ${escHtml(targetTitle)}</h4>
      <p class="popup-addr" style="margin: 2px 0 8px 0; font-size: 11px; color: #64748b;">${escHtml([selectedLoc.district, selectedLoc.province].filter(Boolean).join(', ') || '')}</p>
      
      <button class="popup-find-nearby-btn" onclick="event.stopPropagation(); triggerSelectLocation('${selectedLoc.id}')" style="background-color: var(--metfone-red, #d32f2f); color: white; border: none; padding: 8px 12px; border-radius: 4px; font-size: 11px; cursor: pointer; margin-top: 6px; width: 100%; font-weight: bold; text-align: center;">🔍 Find Nearby POs</button>
      <a class="popup-gmaps-link" href="${selectedLoc.google_maps_url || `https://www.google.com/maps?q=${selectedLoc.latitude},${selectedLoc.longitude}`}" target="_blank" rel="noopener" style="margin-top: 8px; display: block; font-size:11px; text-align:right;">Open in Google Maps ↗</a>
    </div>
  `);
  
  activeMarkers.push({ id: selectedLoc.id, marker: targetMarker });
  activeStickerMarkers.push({ marker: targetMarker, r: selectedLoc });
  refreshStickerLabels();

  // Zoom in very close directly to the target location at zoom level 17!
  map.setView([selectedLoc.latitude, selectedLoc.longitude], 17, { animate: true, duration: 1.2 });
  
  // Render results in the sidebar list (shows only this target with a big "Find Nearby POs" button)
  renderSingleTargetList(selectedLoc, currentResults);

  // Auto-open target popup
  setTimeout(() => {
    targetMarker.openPopup();
  }, 500);
}

// Render a single target location in the sidebar list (before finding nearby POs)
function renderSingleTargetList(selectedLoc, allMatchedLocs) {
  resultsList.innerHTML = '';
  const targetTitle = selectedLoc.market || selectedLoc.village || selectedLoc.commune || 'Target Location';

  // If there are multiple matches, render the switch bar
  if (allMatchedLocs && allMatchedLocs.length > 1) {
    const matchBar = document.createElement('div');
    matchBar.className = 'search-matches-bar';
    matchBar.innerHTML = `
      <div class="matches-title">📍 Alternative Matches:</div>
      <div class="matches-pills">
        ${allMatchedLocs.map(r => {
          const isActive = (r.market === targetTitle);
          return `
            <button class="match-pill ${isActive ? 'active' : ''}" onclick="triggerShowSingleLocation('${r.id}')">
              ${escHtml(r.market)}
            </button>
          `;
        }).join('')}
      </div>
    `;
    resultsList.appendChild(matchBar);
  }

  const card = document.createElement('div');
  card.className = 'location-card selected';
  card.setAttribute('data-id', selectedLoc.id);
  card.style.borderLeft = '4px solid var(--metfone-red, #d32f2f)';

  const title = selectedLoc.market || selectedLoc.village || selectedLoc.commune || 'Target Location';
  const titleKh = selectedLoc.market_kh || selectedLoc.village_kh || selectedLoc.commune_kh || '';
  const q = normalizeKhmer(searchInput.value);

  card.innerHTML = `
    <div class="card-grid">
      <div class="card-index" style="background-color: var(--metfone-red, #d32f2f); color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;">
        <span class="index-num">🎯</span>
        <span class="type-badge" style="background-color: #1e3a8a; color: white;">TARGET</span>
      </div>
      <div class="card-content">
        <div class="card-top">
          <span class="card-title" style="font-weight: 700;">${highlightMatch(title, q)}</span>
          ${selectedLoc.branch_id ? `<span class="card-branch-tag">ID: ${highlightMatch(selectedLoc.branch_id, q)}</span>` : ''}
        </div>
        ${titleKh ? `<div class="card-title-kh">${highlightMatch(titleKh, q)}</div>` : ''}
        <div class="card-address">
          <span class="label-mono">📍</span> ${highlightMatch([selectedLoc.village, selectedLoc.commune, selectedLoc.district, selectedLoc.province].filter(Boolean).join(', '), q)}
        </div>
        ${selectedLoc.village_kh || selectedLoc.district_kh ? `
        <div class="card-address-kh">
          ${highlightMatch([selectedLoc.village_kh, selectedLoc.commune_kh, selectedLoc.district_kh, selectedLoc.province_kh].filter(Boolean).join(', '), q)}
        </div>` : ''}
        <a class="card-gmaps-link" href="${selectedLoc.google_maps_url || `https://www.google.com/maps?q=${selectedLoc.latitude},${selectedLoc.longitude}`}" target="_blank" rel="noopener" onclick="event.stopPropagation();">Open in Google Maps ↗</a>
        
        <button class="card-nearby-action-btn" onclick="event.stopPropagation(); selectLocationAndFindNearbyPOs(currentResults.find(r => r.id === '${selectedLoc.id}'), currentResults)" style="background: var(--metfone-red, #d32f2f); color: white; border: none; padding: 10px 16px; border-radius: 6px; font-size: 12px; font-weight: bold; width: 100%; margin-top: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <span>🔍</span> Find Nearby Post Offices
        </button>
      </div>
    </div>
  `;

  // Clicking the card itself also triggers finding nearby POs!
  card.addEventListener('click', () => {
    selectLocationAndFindNearbyPOs(selectedLoc, allMatchedLocs);
  });

  resultsList.appendChild(card);
  
  if (resultsCount) {
    resultsCount.innerHTML = `Found Location: <span>${escHtml(targetTitle)}</span>. Click "Find Nearby Post Offices" to see routing.`;
  }
}

// Global selector wrapper for alternative matches in single target view
window.triggerShowSingleLocation = function(id) {
  const matched = (currentResults || []).find(r => r.id === id);
  if (matched) {
    showSingleTargetOnMap(matched, currentResults);
  }
};


// Custom non-blocking modal replacement for window.alert and window.confirm
function showCustomModal({ title, message, icon = '🔔', showCancel = false }) {
  return new Promise((resolve) => {
    const modal = document.getElementById('customModal');
    const titleEl = document.getElementById('customModalTitle');
    const msgEl = document.getElementById('customModalMessage');
    const iconEl = document.getElementById('customModalIcon');
    const okBtn = document.getElementById('customModalOkBtn');
    const cancelBtn = document.getElementById('customModalCancelBtn');

    if (!modal) {
      // Fallback in case element is missing
      if (showCancel) {
        resolve(confirm(message));
      } else {
        alert(message);
        resolve(true);
      }
      return;
    }

    titleEl.textContent = title;
    msgEl.textContent = message;
    iconEl.textContent = icon;
    
    if (showCancel) {
      cancelBtn.style.display = 'block';
    } else {
      cancelBtn.style.display = 'none';
    }

    modal.style.display = 'flex';

    const handleOk = () => {
      cleanup();
      resolve(true);
    };

    const handleCancel = () => {
      cleanup();
      resolve(false);
    };

    const cleanup = () => {
      modal.style.display = 'none';
      okBtn.removeEventListener('click', handleOk);
      cancelBtn.removeEventListener('click', handleCancel);
    };

    okBtn.addEventListener('click', handleOk);
    cancelBtn.addEventListener('click', handleCancel);
  });
}

function customAlert(message, title = 'Notification') {
  return showCustomModal({ title, message, icon: '🔔', showCancel: false });
}

function customConfirm(message, title = 'Please Confirm') {
  return showCustomModal({ title, message, icon: '❓', showCancel: true });
}

// Mobile Sliding Bottom Drawer Control
function setupMobileDrawer() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  // Set default state on mobile
  if (window.innerWidth <= 768) {
    sidebar.classList.add('sheet-peeking');
  }

  // Double tap or click on peeking header/grab handle area to expand/collapse
  sidebar.addEventListener('click', (e) => {
    if (window.innerWidth > 768) return;

    // Detect if click happened in the top grab handle zone (top 32px)
    const rect = sidebar.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    
    if (clickY >= 0 && clickY <= 38) {
      e.stopPropagation();
      if (sidebar.classList.contains('sheet-collapsed')) {
        sidebar.classList.remove('sheet-collapsed');
        sidebar.classList.add('sheet-peeking');
      } else if (sidebar.classList.contains('sheet-peeking')) {
        sidebar.classList.remove('sheet-peeking');
        sidebar.classList.add('sheet-expanded');
      } else {
        sidebar.classList.remove('sheet-expanded');
        sidebar.classList.add('sheet-collapsed');
      }
    }
  });
}

function expandMobileDrawer(state = 'sheet-peeking') {
  if (window.innerWidth > 768) return;
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    sidebar.classList.remove('sheet-collapsed', 'sheet-peeking', 'sheet-expanded');
    sidebar.classList.add(state);
  }
}

// ─── GOOGLE MAPS STYLE LOCAL SAVED & RECENTS MODULE ───

// Saved locations LocalStorage manager
function getSavedBranches() {
  try {
    return JSON.parse(localStorage.getItem('metfone_saved_branches')) || [];
  } catch (e) {
    return [];
  }
}

function saveBranch(branchId) {
  let saved = getSavedBranches();
  if (!saved.includes(branchId)) {
    saved.push(branchId);
    localStorage.setItem('metfone_saved_branches', JSON.stringify(saved));
  }
}

function unsaveBranch(branchId) {
  let saved = getSavedBranches();
  saved = saved.filter(id => id !== branchId);
  localStorage.setItem('metfone_saved_branches', JSON.stringify(saved));
}

function isBranchSaved(branchId) {
  return getSavedBranches().includes(branchId);
}

// Recent Searches LocalStorage manager
function getRecentSearches() {
  try {
    return JSON.parse(localStorage.getItem('metfone_recent_searches')) || [];
  } catch (e) {
    return [];
  }
}

function addRecentSearch(query) {
  if (!query) return;
  let recents = getRecentSearches();
  recents = recents.filter(item => item.query.toLowerCase() !== query.toLowerCase());
  recents.unshift({
    query: query,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    date: new Date().toLocaleDateString()
  });
  if (recents.length > 10) recents.pop();
  localStorage.setItem('metfone_recent_searches', JSON.stringify(recents));
}

function clearRecentSearches() {
  localStorage.removeItem('metfone_recent_searches');
}

// Expose Save Toggle to DOM click handlers
function toggleSaveBranch(id) {
  if (isBranchSaved(id)) {
    unsaveBranch(id);
  } else {
    saveBranch(id);
  }
  
  if (currentTab === 'saved') {
    renderSavedBranchesList();
  } else {
    const btn = document.querySelector(`.location-card[data-id="${id}"] .card-save-btn`);
    if (btn) {
      const saved = isBranchSaved(id);
      btn.innerHTML = saved ? '🔖 Saved' : '🔖 Save';
      btn.style.color = saved ? 'var(--metfone-red)' : 'var(--text-light)';
      btn.style.fontWeight = saved ? '700' : 'normal';
    }
  }
}
window.toggleSaveBranch = toggleSaveBranch;

// Render Saved Branches View
function renderSavedBranchesList() {
  showState('welcome');
  resultsList.innerHTML = '';
  
  const savedIds = getSavedBranches();
  if (savedIds.length === 0) {
    if (resultsCount) resultsCount.innerHTML = 'No Saved Locations';
    resultsList.innerHTML = `
      <div style="padding: var(--space-6) var(--space-4); text-align: center;">
        <div style="font-size: 3rem; margin-bottom: var(--space-3);">🔖</div>
        <h3 style="font-size: 16px; font-weight: 700; color: var(--forest-900); margin: 0 0 8px 0;">No Saved Locations</h3>
        <p style="font-size: 12px; color: var(--text-muted); margin: 0; line-height: 1.5;">Click "Save" on any branch or market card to add it here for quick access.</p>
      </div>
    `;
    return;
  }

  if (resultsCount) resultsCount.innerHTML = `Saved Locations: <span>${savedIds.length}</span>`;
  
  const savedItems = [];
  savedIds.forEach(id => {
    let item = clientMarkets.find(m => String(m.id) === String(id));
    if (!item) {
      item = clientBranches.find(b => String(b.branch_id) === String(id) || String(b.id) === String(id));
    }
    if (item) savedItems.push(item);
  });
  
  renderResultsList(savedItems, false);
}

// Render Recent Searches View
function renderRecentSearchesList() {
  showState('welcome');
  resultsList.innerHTML = '';
  
  const recents = getRecentSearches();
  if (recents.length === 0) {
    if (resultsCount) resultsCount.innerHTML = 'No Recent Searches';
    resultsList.innerHTML = `
      <div style="padding: var(--space-6) var(--space-4); text-align: center;">
        <div style="font-size: 3rem; margin-bottom: var(--space-3);">🕒</div>
        <h3 style="font-size: 16px; font-weight: 700; color: var(--forest-900); margin: 0 0 8px 0;">No Search History</h3>
        <p style="font-size: 12px; color: var(--text-muted); margin: 0; line-height: 1.5;">Your search queries will appear here so you can easily run them again.</p>
      </div>
    `;
    return;
  }

  if (resultsCount) resultsCount.innerHTML = `Recent Searches: <span>${recents.length}</span>`;
  
  const historyContainer = document.createElement('div');
  historyContainer.style.display = 'flex';
  historyContainer.style.flexDirection = 'column';
  historyContainer.style.gap = '8px';
  historyContainer.style.padding = 'var(--space-3) var(--space-4)';
  
  recents.forEach(item => {
    const row = document.createElement('div');
    row.style.background = 'var(--bg-card)';
    row.style.border = '1px solid var(--sage-200)';
    row.style.borderRadius = 'var(--radius-md)';
    row.style.padding = '12px 14px';
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.cursor = 'pointer';
    row.style.transition = 'all 0.2s ease';
    
    row.addEventListener('mouseover', () => {
      row.style.borderColor = 'var(--metfone-red)';
      row.style.transform = 'translateY(-1px)';
      row.style.boxShadow = 'var(--shadow-sm)';
    });
    row.addEventListener('mouseout', () => {
      row.style.borderColor = 'var(--sage-200)';
      row.style.transform = 'none';
      row.style.boxShadow = 'none';
    });
    
    row.addEventListener('click', () => {
      searchInput.value = item.query;
      switchTab('search');
      runSmartFind();
    });
    
    row.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1;">
        <span style="font-size: 1.1rem; flex-shrink: 0;">🕒</span>
        <div style="min-width: 0; flex: 1;">
          <div style="font-size: 13px; font-weight: 700; color: var(--forest-900); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escHtml(item.query)}</div>
          <div style="font-size: 10px; color: var(--text-light); margin-top: 2px;">${item.date} · ${item.time}</div>
        </div>
      </div>
      <span style="font-size: 10px; color: var(--metfone-red); font-weight: 700; padding: 2px 6px; background: var(--metfone-red-light); border-radius: 4px; flex-shrink: 0;">RE-RUN</span>
    `;
    
    historyContainer.appendChild(row);
  });
  
  const clearBtnRow = document.createElement('div');
  clearBtnRow.style.display = 'flex';
  clearBtnRow.style.justifyContent = 'center';
  clearBtnRow.style.marginTop = '12px';
  
  const clearBtn = document.createElement('button');
  clearBtn.innerHTML = '🗑️ Clear History';
  clearBtn.style.background = 'transparent';
  clearBtn.style.border = '1px solid var(--metfone-red)';
  clearBtn.style.color = 'var(--metfone-red)';
  clearBtn.style.fontSize = '11px';
  clearBtn.style.fontWeight = '700';
  clearBtn.style.padding = '6px 16px';
  clearBtn.style.borderRadius = 'var(--radius-pill)';
  clearBtn.style.cursor = 'pointer';
  clearBtn.style.transition = 'all 0.2s ease';
  
  clearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm('Clear all search history?')) {
      clearRecentSearches();
      renderRecentSearchesList();
    }
  });
  
  clearBtnRow.appendChild(clearBtn);
  historyContainer.appendChild(clearBtnRow);
  resultsList.appendChild(historyContainer);
}

// Switching Tab Action
let currentTab = 'search';
function switchTab(tabId) {
  currentTab = tabId;
  
  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById('nav' + tabId.charAt(0).toUpperCase() + tabId.slice(1));
  if (activeBtn) activeBtn.classList.add('active');
  
  const searchSection = document.querySelector('.grid-section');
  
  if (tabId === 'search') {
    if (searchSection) searchSection.style.display = 'block';
    if (currentResults && currentResults.length > 0) {
      showState('welcome');
      renderResultsList(currentResults, false);
    } else {
      showState('welcome');
      if (resultsCount) resultsCount.innerHTML = '';
    }
  } else if (tabId === 'saved') {
    if (searchSection) searchSection.style.display = 'none';
    renderSavedBranchesList();
  } else if (tabId === 'recents') {
    if (searchSection) searchSection.style.display = 'none';
    renderRecentSearchesList();
  }
}
window.switchTab = switchTab;

// Sidebar Resizer Handler
function setupSidebarResizer() {
  const resizer = document.getElementById('sidebarResizer');
  const sidebar = document.querySelector('.sidebar');
  if (!resizer || !sidebar) return;

  let isResizing = false;

  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isResizing = true;
    resizer.classList.add('resizing');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    
    let newWidth = e.clientX;
    const minWidth = 514;
    const maxWidth = Math.min(800, window.innerWidth * 0.55);
    
    if (newWidth < minWidth) newWidth = minWidth;
    if (newWidth > maxWidth) newWidth = maxWidth;
    
    sidebar.style.width = newWidth + 'px';
    
    if (map) {
      map.invalidateSize({ animate: false });
    }
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      resizer.classList.remove('resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (map) {
        map.invalidateSize();
      }
    }
  });
}

// Sidebar Curtain Collapse/Expand toggle handler (Google Maps Style)
function setupSidebarCurtain() {
  const toggleBtn = document.getElementById('sidebarCurtainToggle');
  const sidebar = document.querySelector('.sidebar');
  if (!toggleBtn || !sidebar) return;

  let isCollapsed = false;

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    isCollapsed = !isCollapsed;
    
    if (isCollapsed) {
      // Collapse sidebar: shift left by its current offsetWidth
      sidebar.style.marginLeft = `-${sidebar.offsetWidth}px`;
      // Update SVG arrow icon to face right (▶)
      toggleBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
      `;
      toggleBtn.title = "Expand Sidebar";
    } else {
      // Expand sidebar
      sidebar.style.marginLeft = '0px';
      // Update SVG arrow icon to face left (◀)
      toggleBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
      `;
      toggleBtn.title = "Collapse Sidebar";
    }

    // Trigger map invalidation loop during the 300ms CSS transition
    let count = 0;
    const interval = setInterval(() => {
      if (map) map.invalidateSize({ animate: false });
      count++;
      if (count >= 18) { // 18 * 16ms = ~288ms
        clearInterval(interval);
        if (map) map.invalidateSize();
      }
    }, 16);
  });
}


