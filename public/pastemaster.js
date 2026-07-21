// ─── STANDALONE PASTE MASTER RESOLVER LOGIC ──────────────────────────────────
let pmRows = [];
let pmMap;
let markerClusterGroup;
let clientMergedRoutes = [];
let clientBranches = [];
let activeMarkers = [];

// Custom icons matching style.css
const blueIcon = L.icon({
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

document.addEventListener('DOMContentLoaded', async () => {
  initMap();
  await loadClientData();
  setupPasteMasterController();
});

function initMap() {
  const container = document.getElementById('pmMap');
  if (!container || typeof L === 'undefined') return;
  pmMap = L.map('pmMap', {
    zoomControl: true,
    attributionControl: true
  }).setView([12.5657, 104.9910], 7); // Center Cambodia
  
  // Voyager base layer
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(pmMap);
  
  markerClusterGroup = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 40
  });
  pmMap.addLayer(markerClusterGroup);
}

async function loadClientData() {
  try {
    const routesRes = await fetch('/data/routes.json');
    const branchesRes = await fetch('/data/pickup_branches.json');
    if (routesRes.ok) clientMergedRoutes = await routesRes.json();
    if (branchesRes.ok) clientBranches = await branchesRes.json();
    console.log('✅ Standalone Paste Master loaded', clientMergedRoutes.length, 'routes,', clientBranches.length, 'branches');
  } catch (e) {
    console.error('Failed to load client data', e);
  }
}

// Search local databases for market/PO branch matches
function clientSearch(query, type, province) {
  if (!query) return [];
  const normQ = normalizeKhmer(query).toLowerCase();
  
  return clientMergedRoutes.filter(r => {
    if (province) {
      const normP = normalizeKhmer(province).toLowerCase();
      const routeP = normalizeKhmer(r.province_kh || r.province || '').toLowerCase();
      if (routeP !== normP && !routeP.includes(normP) && !normP.includes(routeP)) return false;
    }
    
    const mKh = normalizeKhmer(r.market_kh || '').toLowerCase();
    const mEn = normalizeKhmer(r.market || '').toLowerCase();
    const vKh = normalizeKhmer(r.village_kh || '').toLowerCase();
    const vEn = normalizeKhmer(r.village || '').toLowerCase();
    const cKh = normalizeKhmer(r.commune_kh || '').toLowerCase();
    const cEn = normalizeKhmer(r.commune || '').toLowerCase();
    
    return mKh.includes(normQ) || mEn.includes(normQ) || 
           vKh.includes(normQ) || vEn.includes(normQ) ||
           cKh.includes(normQ) || cEn.includes(normQ);
  });
}

let pmLang = 'en';

const pmDict = {
  en: {
    headerTitle: "Paste Master Excel Address Resolver",
    networkVersion: "Metfone Logistics Network v3.1.6",
    goBack: "Go back",
    inputLabel: "1. Raw Address Input (One per line)",
    inputPlaceholder: "Paste address keywords here. Example:\nផ្ទះបងនៅម្ដុំបាលីរីសតភូមិត្រពាំងល្វាសង្កាត់កាកាប ពោធិ៍សែនជ័យ\nបឹងកេងកង\nផ្សារទួលពង្រ\nក្រោយវត្តស្ទឹងមានជ័យ",
    btnResolve: "⚡ Resolve Addresses",
    resultsLabel: "2. Structured Results & Disambiguation (Excel Spreadsheet Grid)",
    colNum: "#",
    colAddress: "Address Details",
    colDistrict: "Destination District (Khan)",
    colCommune: "Destination Commune (Sangkat)",
    colNearby: "Nearby Match",
    colPoBranch: "Nearest Post Office Branch",
    colResolved: "Resolved Location",
    colStatus: "Status",
    emptyText: "No data resolved. Paste address list on the left and click \"Resolve Addresses\".",
    btnClear: "Clear",
    btnCopyAll: "📋 Copy All (Excel Format)",
    btnExport: "Export CSV / Excel"
  },
  kh: {
    headerTitle: "កម្មវិធីស្វែងរកអាសយដ្ឋាន Paste Master",
    networkVersion: "បណ្តាញដឹកជញ្ជូន Metfone Logistics v3.1.6",
    goBack: "ត្រឡប់ក្រោយ",
    inputLabel: "១. បញ្ចូលអាសយដ្ឋាន (១ បន្ទាត់ម្ដង)",
    inputPlaceholder: "ចម្លងអាសយដ្ឋានដាក់នៅទីនេះ។ ឧទាហរណ៍៖\nផ្ទះបងនៅម្ដុំបាលីរីសតភូមិត្រពាំងល្វាសង្កាត់កាកាប ពោធិ៍សែនជ័យ\nបឹងកេងកង\nផ្សារទួលពង្រ\nក្រោយវត្តស្ទឹងមានជ័យ",
    btnResolve: "⚡ ស្វែងរកអាសយដ្ឋាន",
    resultsLabel: "២. លទ្ធផលដែលបានស្វែងរក (ទម្រង់ Excel)",
    colNum: "ល.រ",
    colAddress: "ព័ត៌មានអាសយដ្ឋាន",
    colDistrict: "ខណ្ឌ / ស្រុក គោលដៅ",
    colCommune: "សង្កាត់ / ឃុំ គោលដៅ",
    colNearby: "កូដសាខា",
    colPoBranch: "សាខាប្រៃសណីយ៍ជិតបំផុត",
    colResolved: "ទីតាំងដែលរកឃើញ",
    colStatus: "ស្ថានភាព",
    emptyText: "មិនទាន់មានទិន្នន័យ។ សូមចម្លងបញ្ជីអាសយដ្ឋាននៅខាងឆ្វេង ហើយចុច \"ស្វែងរកអាសយដ្ឋាន\"។",
    btnClear: "លុបសម្អាត",
    btnCopyAll: "📋 ចម្លងទាំងអស់ (ទម្រង់ Excel)",
    btnExport: "ទាញយក Excel / CSV"
  }
};

function switchPmLanguage(lang) {
  pmLang = lang;
  const t = pmDict[lang] || pmDict.en;
  
  const btnEn = document.getElementById('pmLangEn');
  const btnKh = document.getElementById('pmLangKh');
  if (btnEn && btnKh) {
    if (lang === 'kh') {
      btnEn.style.background = 'transparent'; btnEn.style.color = 'white';
      btnKh.style.background = 'white'; btnKh.style.color = '#107c41';
    } else {
      btnEn.style.background = 'white'; btnEn.style.color = '#107c41';
      btnKh.style.background = 'transparent'; btnKh.style.color = 'white';
    }
  }

  const elTitle = document.getElementById('pmHeaderTitle'); if (elTitle) elTitle.textContent = t.headerTitle;
  const elVer = document.getElementById('pmNetworkVersion'); if (elVer) elVer.textContent = t.networkVersion;
  const elBack = document.getElementById('pmGoBackBtn'); if (elBack) elBack.textContent = t.goBack;
  const elInputLbl = document.getElementById('pmInputLabel'); if (elInputLbl) elInputLbl.textContent = t.inputLabel;
  const elInput = document.getElementById('pmRawInput'); if (elInput) elInput.placeholder = t.inputPlaceholder;
  const elRunBtn = document.getElementById('pmRunBtn'); if (elRunBtn) elRunBtn.textContent = t.btnResolve;
  const elResLbl = document.getElementById('pmResultsLabel'); if (elResLbl) elResLbl.textContent = t.resultsLabel;
  const thNum = document.getElementById('thNum'); if (thNum) thNum.textContent = t.colNum;
  const thAddr = document.getElementById('thAddress'); if (thAddr) thAddr.textContent = t.colAddress;
  const thDist = document.getElementById('thDistrict'); if (thDist) thDist.textContent = t.colDistrict;
  const thComm = document.getElementById('thCommune'); if (thComm) thComm.textContent = t.colCommune;
  const thNear = document.getElementById('thNearby'); if (thNear) thNear.textContent = t.colNearby;
  const thPo = document.getElementById('thPoBranch'); if (thPo) thPo.textContent = t.colPoBranch;
  const thRes = document.getElementById('thResolved'); if (thRes) thRes.textContent = t.colResolved;
  const thStat = document.getElementById('thStatus'); if (thStat) thStat.textContent = t.colStatus;
  const elClear = document.getElementById('pmClearBtn'); if (elClear) elClear.textContent = t.btnClear;
  const elCopyAll = document.getElementById('pmCopyAllBtn'); if (elCopyAll) elCopyAll.textContent = t.btnCopyAll;
  const elExport = document.getElementById('pmExportBtn'); if (elExport) elExport.textContent = t.btnExport;

  // Re-render rows with updated language
  pmRows.forEach((r, idx) => renderPmRow(idx));
}

function setupPasteMasterController() {
  const pmRunBtn = document.getElementById('pmRunBtn');
  const pmClearBtn = document.getElementById('pmClearBtn');
  const pmPlotBtn = document.getElementById('pmPlotBtn');
  const pmExportBtn = document.getElementById('pmExportBtn');
  const pmRawInput = document.getElementById('pmRawInput');
  const pmCopyAllBtn = document.getElementById('pmCopyAllBtn');

  const btnEn = document.getElementById('pmLangEn');
  const btnKh = document.getElementById('pmLangKh');
  if (btnEn) btnEn.addEventListener('click', () => switchPmLanguage('en'));
  if (btnKh) btnKh.addEventListener('click', () => switchPmLanguage('kh'));

  if (pmClearBtn) {
    pmClearBtn.addEventListener('click', () => {
      if (pmRawInput) pmRawInput.value = '';
      pmRows = [];
      const body = document.getElementById('pmResultsBody');
      if (body) {
        const t = pmDict[pmLang] || pmDict.en;
        body.innerHTML = `
          <tr>
            <td colspan="8" class="pm-empty-cell" id="pmEmptyCell" style="text-align: center; padding: 40px; color: #64748b;">
              ${t.emptyText}
            </td>
          </tr>
        `;
      }
      if (pmPlotBtn) pmPlotBtn.disabled = true;
      if (pmExportBtn) pmExportBtn.disabled = true;
      if (pmCopyAllBtn) pmCopyAllBtn.disabled = true;
      if (markerClusterGroup) markerClusterGroup.clearLayers();
      activeMarkers = [];
      updatePmStats();
    });
  }

  if (pmRunBtn) {
    pmRunBtn.addEventListener('click', resolveAddresses);
  }

  if (pmPlotBtn) {
    pmPlotBtn.addEventListener('click', plotPmLocationsOnMap);
  }

  if (pmExportBtn) {
    pmExportBtn.addEventListener('click', exportPmCsv);
  }

  if (pmCopyAllBtn) {
    pmCopyAllBtn.addEventListener('click', copyAllPmResults);
  }
}

// Global provinces list for context extraction
const pmProvincesList = [
  { en: 'phnom penh', kh: 'ភ្នំពេញ', val: 'Phnom Penh' },
  { en: 'kandal', kh: 'កណ្តាល', val: 'Kandal' },
  { en: 'battambang', kh: 'បាត់ដំបង', val: 'Battambang' },
  { en: 'siem reap', kh: 'សៀមរាប', val: 'Siem Reap' },
  { en: 'siemreap', kh: 'សៀមរាប', val: 'Siem Reap' },
  { en: 'pursat', kh: 'ពោធិ៍សាត់', val: 'Pursat' },
  { en: 'banteay meanchey', kh: 'បន្ទាយមានជ័យ', val: 'Banteay Meanchey' },
  { en: 'kampong cham', kh: 'កំពង់ចាម', val: 'Kampong Cham' },
  { en: 'kampong chhnang', kh: 'កំពង់ឆ្នាំង', val: 'Kampong Chhnang' },
  { en: 'kampong speu', kh: 'កំពង់ស្ពឺ', val: 'Kampong Speu' },
  { en: 'kampong thom', kh: 'កំពង់ធំ', val: 'Kampong Thom' },
  { en: 'kampot', kh: 'កំពត', val: 'Kampot' },
  { en: 'kep', kh: 'កែប', val: 'Kep' },
  { en: 'koh kong', kh: 'កោះកុង', val: 'Koh Kong' },
  { en: 'kratie', kh: 'ក្រចេះ', val: 'Kratie' },
  { en: 'mondulkiri', kh: 'មណ្ឌលគិរី', val: 'Mondulkiri' },
  { en: 'otdar meanchey', kh: 'ឧត្តរមានជ័យ', val: 'Oddar Meanchey' },
  { en: 'oddar meanchey', kh: 'ឧត្តរមានជ័យ', val: 'Oddar Meanchey' },
  { en: 'pailin', kh: 'ប៉ៃលិន', val: 'Pailin' },
  { en: 'preah sihanouk', kh: 'ព្រះសីហនុ', val: 'Preah Sihanouk' },
  { en: 'preah vihear', kh: 'ព្រះវិហារ', val: 'Preah Vihear' },
  { en: 'prey veng', kh: 'ព្រៃវែង', val: 'Prey Veng' },
  { en: 'ratanakiri', kh: 'រតនគិរី', val: 'Ratanakiri' },
  { en: 'stung treng', kh: 'ស្ទឹងត្រែង', val: 'Stung Treng' },
  { en: 'svay rieng', kh: 'ស្វាយរៀង', val: 'Svay Rieng' },
  { en: 'takeo', kh: 'តាកែវ', val: 'Takeo' },
  { en: 'tboung khmum', kh: 'ត្បូងឃ្មុំ', val: 'Tboung Khmum' }
];

// Helper to extract keywords from Khmer address sentences to match NCDD hierarchy
function cleanAndExtractKeywords(line) {
  let q = line.normalize("NFC").trim();
  
  // Remove conversational noise prefixes
  q = q.replace(/^(ផ្ទះបងនៅម្ដុំ|ផ្ទះនៅម្ដុំ|នៅម្ដុំ|ទីតាំង|ជិត|ក្បែរ|ផ្ទះ|ផ្លូវ|ទីតាំង:ក្នុងតំបន់|ក្នុងតំបន់|ក្រោយ|ជិត)\s*/gi, '');
  
  // Extract parts between Khmer admin markers
  const parts = [];
  const markers = ['ភូមិ', 'ឃុំ', 'សង្កាត់', 'ស្រុក', 'ខណ្ឌ', 'ក្រុង', 'ខេត្ត', 'រាជធានី'];
  
  let currentText = q;
  markers.forEach(marker => {
    if (currentText.includes(marker)) {
      const idx = currentText.indexOf(marker);
      const prefixVal = currentText.substring(0, idx).trim();
      if (prefixVal) parts.push(prefixVal);
      currentText = currentText.substring(idx + marker.length).trim();
    }
  });
  if (currentText) parts.push(currentText);
  
  return parts.map(p => p.trim()).filter(p => p.length >= 2);
}

// Helper to lookup matching NCDD code for resolved geocoded names
async function lookupNcddCodeForNames(province, district, commune, village) {
  let query = '';
  if (village && commune) {
    query = `${village}, ${commune}`;
  } else if (commune && district) {
    query = `${commune}, ${district}`;
  } else if (commune) {
    query = commune;
  } else if (district) {
    query = district;
  }
  
  if (!query) return null;
  
  try {
    const res = await fetch(`/api/ncdd/search?q=${encodeURIComponent(query)}&limit=5`);
    if (res.ok) {
      const list = await res.json();
      if (list && list.length > 0) {
        let bestMatch = list[0];
        if (province) {
          const normProv = normalizeKhmer(province).toLowerCase();
          const match = list.find(item => {
            const itemProv = normalizeKhmer(item.province_kh || item.province_en || '').toLowerCase();
            return itemProv === normProv || itemProv.includes(normProv) || normProv.includes(itemProv);
          });
          if (match) bestMatch = match;
        }
        return bestMatch.code;
      }
    }
  } catch (e) {
    console.warn('NCDD code lookup failed for names:', query, e);
  }
  return null;
}

async function resolveAddresses() {
  const pmRawInput = document.getElementById('pmRawInput');
  const pmRunBtn = document.getElementById('pmRunBtn');
  const body = document.getElementById('pmResultsBody');

  if (!pmRawInput || !body) return;

  const lines = pmRawInput.value.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    alert('Please paste some addresses first.');
    return;
  }

  pmRunBtn.disabled = true;
  pmRunBtn.textContent = 'Resolving...';
  body.innerHTML = '';

  pmRows = lines.map((line, idx) => ({
    index: idx,
    rawText: line,
    status: 'loading',
    resolvedName: '',
    lat: null,
    lng: null,
    code: '',
    province: '',
    province_kh: '',
    district: '',
    district_kh: '',
    commune: '',
    commune_kh: '',
    candidates: [],
    nearestPo: null
  }));

  // Initial render of loading rows
  pmRows.forEach(row => {
    const tr = document.createElement('tr');
    tr.id = `pm-row-${row.index}`;
    tr.innerHTML = `
      <td style="text-align: center; font-weight: 700; color: #94a3b8;">${row.index + 1}</td>
      <td style="font-weight: 600;">${escHtml(row.rawText)}</td>
      <td id="pm-row-val-${row.index}" style="color: #64748b; font-style: italic;">Parsing address...</td>
      <td style="text-align: center;"><span class="pm-status-badge loading">Loading</span></td>
      <td id="pm-row-po-${row.index}">-</td>
    `;
    body.appendChild(tr);
  });

  updatePmStats();

  // Resolve all rows in parallel
  const resolvePromises = pmRows.map(async (row) => {
    try {
      const query = row.rawText;
      const normQ = normalizeKhmer(query).toLowerCase();

      // Extract province context
      let detectedProvince = '';
      for (const p of pmProvincesList) {
        if (normQ.includes(p.en) || normQ.includes(p.kh)) {
          detectedProvince = p.val;
          break;
        }
      }

      // Check if it's direct coordinates e.g. "11.556, 104.928"
      const coords = parseCoordinates(query);
      if (coords) {
        row.status = 'exact';
        row.resolvedName = `GPS Coordinates (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`;
        row.lat = coords.lat;
        row.lng = coords.lng;
        row.province = 'GPS Location';
        row.nearestPo = findNearestPoForCoords(row.lat, row.lng);
        renderPmRow(row.index);
        return;
      }

      const candidates = [];

      // 1. Primary NCDD Search
      const ncddUrl = `/api/ncdd/search?q=${encodeURIComponent(query)}&limit=15`;
      const ncddRes = await fetch(ncddUrl);
      let ncddData = [];
      if (ncddRes.ok) {
        ncddData = await ncddRes.json();
      }

      // 2. Local database search
      const localResults = clientSearch(query, 'market', detectedProvince || '');
      localResults.slice(0, 5).forEach(r => {
        candidates.push({
          source: 'local',
          name: r.market || r.village || r.commune,
          name_kh: r.market_kh || r.village_kh || r.commune_kh || '',
          lat: r.latitude,
          lng: r.longitude,
          province: r.province,
          district: r.district,
          commune: r.commune,
          path_en: [r.commune, r.district, r.province].filter(Boolean).join(', '),
          path_kh: [r.commune_kh, r.district_kh, r.province_kh].filter(Boolean).join(', ')
        });
      });

      // Add primary NCDD matches
      ncddData.forEach(item => {
        const localMatch = clientMergedRoutes.find(r => {
          const itemProv = normalizeKhmer(item.province_kh).toLowerCase();
          const routeProv = normalizeKhmer(r.province_kh || r.province || '').toLowerCase();
          if (routeProv !== itemProv && !routeProv.includes(itemProv) && !itemProv.includes(routeProv)) return false;
          
          if (item.type === 'village') {
            const itemVill = normalizeKhmer(item.village_kh).toLowerCase();
            const routeVill = normalizeKhmer(r.village_kh || r.village || '').toLowerCase();
            return routeVill && (routeVill === itemVill || routeVill.includes(itemVill));
          } else if (item.type === 'commune') {
            const itemComm = normalizeKhmer(item.commune_kh).toLowerCase();
            const routeComm = normalizeKhmer(r.commune_kh || r.commune || '').toLowerCase();
            return routeComm && (routeComm === itemComm || routeComm.includes(itemComm));
          } else if (item.type === 'district') {
            const itemDist = normalizeKhmer(item.district_kh).toLowerCase();
            const routeDist = normalizeKhmer(r.district_kh || r.district || '').toLowerCase();
            return routeDist && (routeDist === itemDist || routeDist.includes(itemDist));
          }
          return false;
        });

        candidates.push({
          source: 'ncdd',
          name: item.path_en,
          name_kh: item.path_kh,
          code: item.code,
          lat: localMatch ? localMatch.latitude : null,
          lng: localMatch ? localMatch.longitude : null,
          province: item.province_en,
          province_kh: item.province_kh,
          district: item.district_en,
          district_kh: item.district_kh,
          commune: item.commune_en,
          commune_kh: item.commune_kh,
          village: item.village_en,
          village_kh: item.village_kh,
          path_en: item.path_en,
          path_kh: item.path_kh
        });
      });

      // 3. Fallback to keyword-isolated NCDD search if no matches
      if (candidates.length === 0) {
        const keywords = cleanAndExtractKeywords(query);
        for (const kw of keywords) {
          if (kw === query) continue;
          const ncddResKw = await fetch(`/api/ncdd/search?q=${encodeURIComponent(kw)}&limit=10`);
          if (ncddResKw.ok) {
            const ncddDataKw = await ncddResKw.json();
            ncddDataKw.forEach(item => {
              const localMatch = clientMergedRoutes.find(r => {
                const itemProv = normalizeKhmer(item.province_kh).toLowerCase();
                const routeProv = normalizeKhmer(r.province_kh || r.province || '').toLowerCase();
                if (routeProv !== itemProv && !routeProv.includes(itemProv) && !itemProv.includes(routeProv)) return false;
                
                if (item.type === 'village') {
                  const itemVill = normalizeKhmer(item.village_kh).toLowerCase();
                  const routeVill = normalizeKhmer(r.village_kh || r.village || '').toLowerCase();
                  return routeVill && (routeVill === itemVill || routeVill.includes(itemVill));
                } else if (item.type === 'commune') {
                  const itemComm = normalizeKhmer(item.commune_kh).toLowerCase();
                  const routeComm = normalizeKhmer(r.commune_kh || r.commune || '').toLowerCase();
                  return routeComm && (routeComm === itemComm || routeComm.includes(itemComm));
                } else if (item.type === 'district') {
                  const itemDist = normalizeKhmer(item.district_kh).toLowerCase();
                  const routeDist = normalizeKhmer(r.district_kh || r.district || '').toLowerCase();
                  return routeDist && (routeDist === itemDist || routeDist.includes(itemDist));
                }
                return false;
              });

              candidates.push({
                source: 'ncdd',
                name: item.path_en,
                name_kh: item.path_kh,
                code: item.code,
                lat: localMatch ? localMatch.latitude : null,
                lng: localMatch ? localMatch.longitude : null,
                province: item.province_en,
                province_kh: item.province_kh,
                district: item.district_en,
                district_kh: item.district_kh,
                commune: item.commune_en,
                commune_kh: item.commune_kh,
                village: item.village_en,
                village_kh: item.village_kh,
                path_en: item.path_en,
                path_kh: item.path_kh
              });
            });
          }
        }
      }

      // Filter by province context
      let filteredCandidates = candidates;
      if (detectedProvince) {
        const normDet = normalizeKhmer(detectedProvince).toLowerCase();
        filteredCandidates = candidates.filter(c => {
          const p = normalizeKhmer(c.province || '').toLowerCase();
          return p === normDet || p.includes(normDet) || normDet.includes(p);
        });
      }

      // Deduplicate candidates
      const seen = new Set();
      const uniqueCandidates = [];
      filteredCandidates.forEach(c => {
        const key = `${c.name}-${c.province}`.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          uniqueCandidates.push(c);
        }
      });

      // Sort uniqueCandidates by priority score
      uniqueCandidates.sort((a, b) => scoreCandidate(b, query) - scoreCandidate(a, query));

      // 4. Fallback to background geocoding automatically if 0 matches
      if (uniqueCandidates.length === 0) {
        // 4a. Try smart-find API first (uses entity extraction + full pipeline)
        try {
          const sfRes = await fetch(`/api/smart-find?q=${encodeURIComponent(query)}`);
          if (sfRes.ok) {
            const sfData = await sfRes.json();
            if (sfData.found_coords && sfData.found_coords.lat && sfData.found_coords.lng) {
              const ncddCode = await lookupNcddCodeForNames(
                sfData.resolved_market?.province || '',
                sfData.resolved_market?.district || '',
                sfData.resolved_market?.commune || '',
                null
              );
              row.status = 'exact';
              row.resolvedName = sfData.resolved_market?.market_kh 
                ? `${sfData.resolved_market.market_kh} (${sfData.resolved_market.market || ''})` 
                : (sfData.resolved_market?.market || sfData.found_coords.name || query);
              row.lat = sfData.found_coords.lat;
              row.lng = sfData.found_coords.lng;
              row.code = ncddCode || sfData.resolved_market?.code || '';
              row.province = sfData.resolved_market?.province || '';
              row.province_kh = sfData.resolved_market?.province_kh || '';
              row.district = sfData.resolved_market?.district || '';
              row.district_kh = sfData.resolved_market?.district_kh || '';
              row.commune = sfData.resolved_market?.commune || '';
              row.commune_kh = sfData.resolved_market?.commune_kh || '';
              row.confidence = sfData.confidence || 90;
              row.matchedFields = sfData.matchedFields || ['smart_find'];
              row.reason = sfData.reason || 'Resolved via smart-find pipeline.';
              row.nearestPo = findNearestPoForCoords(row.lat, row.lng);
              renderPmRow(row.index);
              return;
            }
          }
        } catch (sfErr) {
          console.warn('Smart-find fallback failed:', sfErr.message);
        }

        // 4b. Try Google geocode as last resort
        const geocodeQuery = query + ', Cambodia';
        const geoRes = await fetch(`/api/google-geocode?q=${encodeURIComponent(geocodeQuery)}`);
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          if (geoData.type === 'multiple' && geoData.results && geoData.results.length > 0) {
            for (const r of geoData.results) {
              const ncddCode = await lookupNcddCodeForNames(r.province, r.district, r.commune, null);
              uniqueCandidates.push({
                source: 'google',
                name: r.market || r.village || r.commune || r.name || query,
                name_kh: r.market_kh || r.village_kh || r.commune_kh || '',
                code: ncddCode,
                lat: r.latitude || r.lat,
                lng: r.longitude || r.lng,
                province: r.province || '',
                province_kh: r.province_kh || '',
                district: r.district || '',
                district_kh: r.district_kh || '',
                commune: r.commune || '',
                commune_kh: r.commune_kh || '',
                path_en: [r.commune, r.district, r.province].filter(Boolean).join(', '),
                path_kh: [r.commune_kh, r.district_kh, r.province_kh].filter(Boolean).join(', ')
              });
            }
          } else if (geoData.lat && geoData.lng) {
            const ncddCode = await lookupNcddCodeForNames(geoData.province, geoData.district, geoData.commune, null);
            row.status = 'exact';
            row.resolvedName = geoData.name || query;
            row.lat = geoData.lat;
            row.lng = geoData.lng;
            row.code = ncddCode;
            row.province = geoData.province || '';
            row.province_kh = geoData.province_kh || '';
            row.district = geoData.district || '';
            row.district_kh = geoData.district_kh || '';
            row.commune = geoData.commune || '';
            row.commune_kh = geoData.commune_kh || '';
            row.confidence = geoData.confidence;
            row.matchedFields = geoData.matchedFields;
            row.reason = geoData.reason;
            row.nearestPo = findNearestPoForCoords(row.lat, row.lng);

            // Dynamically learn geocoded locations
            fetch('/api/learn-location', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: geoData.name || query,
                name_kh: '',
                latitude: geoData.lat,
                longitude: geoData.lng,
                source: 'geocode',
                query: query
              })
            }).catch(() => {});

            renderPmRow(row.index);
            return;
          }
        }
      }

      row.candidates = uniqueCandidates;

      if (uniqueCandidates.length === 1) {
        const match = uniqueCandidates[0];
        row.status = 'exact';
        row.resolvedName = match.name_kh ? `${match.name_kh} (${match.name})` : match.name;
        row.lat = match.lat;
        row.lng = match.lng;
        row.code = match.code;
        row.province = match.province || '';
        row.province_kh = match.province_kh || '';
        row.district = match.district || '';
        row.district_kh = match.district_kh || '';
        row.commune = match.commune || '';
        row.commune_kh = match.commune_kh || '';
        row.confidence = match.confidence || 100;
        row.matchedFields = match.matchedFields || ['local_database'];
        row.reason = match.reason || "Local database exact match.";
        row.nearestPo = findNearestPoForCoords(row.lat, row.lng);
      } else if (uniqueCandidates.length > 1) {
        row.status = 'ambiguous';
      } else {
        row.status = 'not-found';
      }
    } catch (e) {
      console.warn('Failed to resolve row:', row.index, e);
      row.status = 'not-found';
    }
    renderPmRow(row.index);
  });

  await Promise.all(resolvePromises);
  
  pmRunBtn.disabled = false;
  pmRunBtn.textContent = '⚡ Resolve Addresses';
  
  const hasExact = pmRows.some(r => r.status === 'exact' && r.lat && r.lng);
  if (pmPlotBtn) pmPlotBtn.disabled = !hasExact;
  if (pmExportBtn) pmExportBtn.disabled = pmRows.length === 0;
  const pmCopyAllBtn = document.getElementById('pmCopyAllBtn');
  if (pmCopyAllBtn) pmCopyAllBtn.disabled = pmRows.length === 0;

  updatePmStats();
}

function renderPmRow(index) {
  const row = pmRows[index];
  const tr = document.getElementById(`pm-row-${row.index}`);
  if (!tr) return;

  let resolvedTd = '';
  let statusBadge = '';
  let poCodeTd = '-';
  let poBranchTd = '-';

  if (row.nearestPo) {
    const { branch, distance } = row.nearestPo;
    const distText = distance < 1 ? `${Math.round(distance * 1000)}m` : `${distance.toFixed(1)}km`;
    poCodeTd = `<button onclick="copyTextWithToast('${escHtml(branch.store_code)}', this)" title="1-Click Copy Code" style="background:transparent; border:none; color:#dc2626; font-weight:800; font-size:14px; font-family:monospace,Consolas,sans-serif; cursor:pointer; padding:0; margin:0; outline:none;">${escHtml(branch.store_code)}</button>`;
    poBranchTd = `<div style="font-weight:700; color:#1e293b;">${escHtml(branch.store_name)}</div><div style="font-size:10px; color:#64748b;">${distText} away</div>`;
  }

  if (row.candidates && row.candidates.length > 1) {
    let selectHtml = `<div style="display:flex; flex-direction:column; gap:4px;">`;
    selectHtml += `<select class="pm-select-disambig" onchange="resolveRowAmbiguity(${row.index}, this.value)" style="width:100%; padding:4px 6px; border:1px solid #cbd5e1; border-radius:4px; font-size:11px; background:#ffffff;">`;
    selectHtml += `<option value="">${pmLang === 'kh' ? 'ជ្រើសរើសទីតាំង (អាចប្ដូរបាន)...' : 'Select location (can change)...'}</option>`;
    row.candidates.forEach((c, cIdx) => {
      const isSel = row.selectedIndex === cIdx;
      const label = c.path_kh ? `${c.name_kh} (${c.path_en})` : `${c.name} (${c.province})`;
      selectHtml += `<option value="${cIdx}" ${isSel ? 'selected' : ''}>${isSel ? '✓ ' : ''}${escHtml(label)}</option>`;
    });
    selectHtml += `</select>`;
    if (row.status === 'exact') {
      selectHtml += `<div style="font-size:11px; font-weight:700; color:#1e293b;">📍 ${escHtml(row.resolvedName)}</div>`;
    }
    selectHtml += `</div>`;
    resolvedTd = selectHtml;
    
    const labelExact = pmLang === 'kh' ? 'ត្រឹមត្រូវ' : 'Exact';
    const labelAmb = pmLang === 'kh' ? `ជម្រើស (${row.candidates.length})` : `Ambiguous (${row.candidates.length})`;
    
    statusBadge = row.status === 'exact' 
      ? `<span class="pm-status-badge exact" style="background:#dcfce7; color:#166534; padding:3px 8px; border-radius:4px; font-weight:700; font-size:10px; display:inline-block;">${labelExact}</span>`
      : `<span class="pm-status-badge ambiguous" style="background:#fef3c7; color:#92400e; padding:3px 8px; border-radius:4px; font-weight:700; font-size:10px; display:inline-block;">${labelAmb}</span>`;
  } else if (row.status === 'exact') {
    resolvedTd = `<span style="font-weight: 600; color: #1e293b;">${escHtml(row.resolvedName)}</span>`;
    if (row.lat && row.lng) {
      resolvedTd += `<div style="font-size: 10px; color: #64748b; margin-top: 1px;">📍 ${row.lat.toFixed(4)}, ${row.lng.toFixed(4)}</div>`;
    }
    statusBadge = `<span class="pm-status-badge exact" style="background:#dcfce7; color:#166534; padding:3px 8px; border-radius:4px; font-weight:700; font-size:10px; display:inline-block;">${pmLang === 'kh' ? 'ត្រឹមត្រូវ' : 'Exact'}</span>`;
  } else if (row.status === 'not-found') {
    statusBadge = `<span class="pm-status-badge not-found" style="background:#fee2e2; color:#991b1b; padding:3px 8px; border-radius:4px; font-weight:700; font-size:10px; display:inline-block;">${pmLang === 'kh' ? 'រកមិនឃើញ' : 'Not Found'}</span>`;
    resolvedTd = `
      <div style="display: flex; gap: 6px; align-items: center;">
        <span style="color: #ef4444; font-style: italic; font-size: 11px;">${pmLang === 'kh' ? 'គ្មានទិន្នន័យ' : 'No match.'}</span>
        <button class="pm-btn" style="padding: 3px 8px; font-size: 10px; border-radius: 4px; background:#475569; color:white; border:none; cursor:pointer;" onclick="geocodeRow(${row.index})">🔍 Search Online</button>
      </div>
    `;
  } else if (row.status === 'loading') {
    statusBadge = `<span class="pm-status-badge loading" style="background:#f1f5f9; color:#475569; padding:3px 8px; border-radius:4px; font-weight:700; font-size:10px; display:inline-block;">${pmLang === 'kh' ? 'កំពុងស្វែងរក...' : 'Loading...'}</span>`;
    resolvedTd = `<span style="color: #64748b; font-style: italic;">${pmLang === 'kh' ? 'កំពុងស្វែងរក...' : 'Resolving location...'}</span>`;
  }

  const distDisplay = row.district_kh 
    ? `<span style="font-weight:700; color:#0369a1;">${escHtml(row.district_kh)}</span> <span style="font-size:11px; color:#64748b;">(${escHtml(row.district || '')})</span>` 
    : (row.district ? escHtml(row.district) : (row.province_kh || '<span style="color:#94a3b8; font-style:italic;">-</span>'));
  
  const commDisplay = (row.commune_kh || row.commune)
    ? `<span style="font-weight:700; color:#047857;">${escHtml(row.commune_kh || row.commune)}</span> ${row.commune && row.commune !== row.commune_kh ? `<span style="font-size:11px; color:#64748b;">(${escHtml(row.commune)})</span>` : ''}` 
    : (row.district_kh ? `<span style="font-weight:700; color:#047857;">${escHtml(row.district_kh)}</span>` : '<span style="color:#94a3b8; font-style:italic;">-</span>');

  tr.innerHTML = `
    <td style="text-align: center; font-weight: 700; color: #475569;">${row.index + 1}</td>
    <td style="font-weight: 600; color: #334155;">${escHtml(row.rawText)}</td>
    <td>${distDisplay}</td>
    <td>${commDisplay}</td>
    <td style="text-align: center;">${poCodeTd}</td>
    <td>${poBranchTd}</td>
    <td id="pm-row-val-${row.index}">${resolvedTd}</td>
    <td style="text-align: center;">${statusBadge}</td>
  `;
}

function resolveRowAmbiguity(rowIndex, candIndex) {
  if (candIndex === "") return;
  const row = pmRows[rowIndex];
  const candIdx = parseInt(candIndex);
  const cand = row.candidates[candIdx];
  if (!cand) return;

  row.selectedIndex = candIdx;
  row.status = 'exact';
  row.resolvedName = cand.name_kh ? `${cand.name_kh} (${cand.name})` : cand.name;
  row.lat = cand.lat;
  row.lng = cand.lng;
  row.code = cand.code;
  row.province = cand.province || '';
  row.province_kh = cand.province_kh || '';
  row.district = cand.district || '';
  row.district_kh = cand.district_kh || '';
  row.commune = cand.commune || '';
  row.commune_kh = cand.commune_kh || '';
  row.nearestPo = findNearestPoForCoords(row.lat, row.lng);

  renderPmRow(rowIndex);
  if (!row.lat || !row.lng) {
    geocodeRow(rowIndex);
  }
  updatePmStats();
}

async function geocodeRow(rowIndex) {
  const row = pmRows[rowIndex];
  row.status = 'loading';
  renderPmRow(rowIndex);

  try {
    const query = row.rawText + ', Cambodia';
    const res = await fetch(`/api/google-geocode?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error('Geocode failed');
    const data = await res.json();

    if (data.type === 'multiple' && data.results && data.results.length > 0) {
      row.status = 'ambiguous';
      const parsedResults = [];
      for (const r of data.results) {
        const ncddCode = await lookupNcddCodeForNames(r.province, r.district, r.commune, null);
        parsedResults.push({
          source: 'google',
          name: r.market || r.village || r.commune || r.name || query,
          name_kh: r.market_kh || r.village_kh || r.commune_kh || '',
          code: ncddCode,
          lat: r.latitude || r.lat,
          lng: r.longitude || r.lng,
          province: r.province || '',
          province_kh: r.province_kh || '',
          district: r.district || '',
          district_kh: r.district_kh || '',
          commune: r.commune || '',
          commune_kh: r.commune_kh || '',
          path_en: r.google_maps_url || '',
          path_kh: ''
        });
      }
      parsedResults.sort((a, b) => scoreCandidate(b, row.rawText) - scoreCandidate(a, row.rawText));
      row.candidates = parsedResults;
    } else if (data.lat && data.lng) {
      const ncddCode = await lookupNcddCodeForNames(data.province, data.district, data.commune, null);
      row.status = 'exact';
      row.resolvedName = data.name || row.rawText;
      row.lat = data.lat;
      row.lng = data.lng;
      row.code = ncddCode;
      row.province = data.province || '';
      row.province_kh = data.province_kh || '';
      row.district = data.district || '';
      row.district_kh = data.district_kh || '';
      row.commune = data.commune || '';
      row.commune_kh = data.commune_kh || '';
      row.confidence = data.confidence;
      row.matchedFields = data.matchedFields;
      row.reason = data.reason;
      row.nearestPo = findNearestPoForCoords(row.lat, row.lng);

      fetch('/api/learn-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name || row.rawText,
          name_kh: '',
          latitude: data.lat,
          longitude: data.lng,
          source: 'geocode',
          query: row.rawText
        })
      }).catch(() => {});
    } else {
      row.status = 'not-found';
    }
  } catch (e) {
    console.warn('Geocoding row failed:', rowIndex, e);
    row.status = 'not-found';
  }

  renderPmRow(rowIndex);
  const pmPlotBtn = document.getElementById('pmPlotBtn');
  const hasExact = pmRows.some(r => r.status === 'exact' && r.lat && r.lng);
  if (pmPlotBtn) pmPlotBtn.disabled = !hasExact;
  updatePmStats();
}

function updatePmStats() {
  const pmStats = document.getElementById('pmStats');
  if (!pmStats) return;

  if (pmRows.length === 0) {
    pmStats.textContent = 'Resolved: 0 / 0 rows (0% complete)';
    return;
  }

  const exactCount = pmRows.filter(r => r.status === 'exact' && r.lat && r.lng).length;
  const pct = Math.round((exactCount / pmRows.length) * 100);
  pmStats.textContent = `Resolved: ${exactCount} / ${pmRows.length} rows (${pct}% complete)`;
}

function plotPmLocationsOnMap() {
  if (!pmMap || !markerClusterGroup || pmRows.length === 0) return;

  const validRows = pmRows.filter(r => r.status === 'exact' && r.lat && r.lng);
  if (validRows.length === 0) return;

  markerClusterGroup.clearLayers();
  activeMarkers = [];
  
  validRows.forEach(row => {
    const marker = L.marker([row.lat, row.lng], { icon: blueIcon }).addTo(markerClusterGroup);
    
    let popupHtml = `
      <div class="map-popup-content">
        <div class="popup-header" style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom: 6px;">
          <span class="popup-badge" style="background:#2563eb; color:white; padding:2px 5px; font-size:9px; border-radius:3px; font-weight:700;">Batch Resolved</span>
          <span class="popup-coord" style="font-size:10px; color:#64748b;">${row.lat.toFixed(4)}°, ${row.lng.toFixed(4)}°</span>
        </div>
        <h4 style="margin:4px 0; font-size:13px;">📍 ${escHtml(row.rawText)}</h4>
        <p class="popup-addr" style="margin:4px 0; font-size:11px; color:#334155;">Resolved: <b>${escHtml(row.resolvedName)}</b></p>
    `;

    if (row.code) {
      const distCode = row.code.substring(0, 4);
      const commCode = row.code.substring(0, 6);
      const distName = row.district_kh || row.district || '';
      const commName = row.commune_kh || row.commune || '';
      popupHtml += `
        <div style="margin-top: 6px; padding: 6px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; font-size: 11px; line-height: 1.4;">
          🗂️ District: <b>${distCode} (${distName})</b><br>
          📁 Commune: <b>${commCode} (${commName})</b>
        </div>
      `;
    }

    if (row.nearestPo) {
      const { branch, distance } = row.nearestPo;
      const distText = distance < 1 ? `${Math.round(distance * 1000)}m` : `${distance.toFixed(1)}km`;
      popupHtml += `
        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #f1f5f9; font-size: 11px;">
          📮 Nearest PO: <b>${escHtml(branch.store_name)}</b> (${distText} away)
        </div>
      `;
    }

    popupHtml += `</div>`;
    marker.bindPopup(popupHtml);
    activeMarkers.push({ id: row.index, marker });
  });

  // Fit bounds automatically
  if (activeMarkers.length > 0) {
    const group = new L.featureGroup(activeMarkers.map(m => m.marker));
    pmMap.fitBounds(group.getBounds().pad(0.1));
  }
}

function exportPmCsv() {
  if (pmRows.length === 0) return;

  // Use BOM for Excel UTF-8 compatibility
  const BOM = '\uFEFF';
  let csvContent = BOM;
  csvContent += "Line,Raw Address,Destination District (Khan),Destination Commune (Sangkat),Resolved Location,Status,Province,District Code,Commune Code,Latitude,Longitude,Nearest PO ID,Nearest Post Office,PO Distance (km)\n";

  pmRows.forEach((row, idx) => {
    const rawStr = (row.rawText || '').replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, '');
    const distStr = row.district_kh ? `${row.district_kh} (${row.district || ''})` : (row.district || '');
    const commStr = row.commune_kh ? `${row.commune_kh} (${row.commune || ''})` : (row.commune || '');
    const resStr = (row.resolvedName || '').replace(/"/g, '""');
    const status = row.status || '';
    const lat = row.lat || '';
    const lng = row.lng || '';
    
    const province = (row.province_kh || row.province || '').replace(/"/g, '""');
    const distCode = row.code ? row.code.substring(0, 4) : '';
    const commCode = row.code ? row.code.substring(0, 6) : '';
    
    let poId = '';
    let poName = '';
    let poDist = '';
    if (row.nearestPo) {
      poId = row.nearestPo.branch.store_code || '';
      poName = (row.nearestPo.branch.store_name || '').replace(/"/g, '""');
      poDist = row.nearestPo.distance.toFixed(2);
    }

    csvContent += `"${idx + 1}","${rawStr}","${distStr.replace(/"/g, '""')}","${commStr.replace(/"/g, '""')}","${resStr}","${status}","${province}","${distCode}","${commCode}","${lat}","${lng}","${poId}","${poName}","${poDist}"\n`;
  });

  // Use Blob for proper UTF-8 encoding (fixes Khmer characters in Excel)
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `paste_master_results_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function findNearestPoForCoords(lat, lng) {
  if (!lat || !lng || !clientBranches || clientBranches.length === 0) return null;
  let minD = Infinity;
  let closest = null;
  clientBranches.forEach(b => {
    if (b.latitude && b.longitude) {
      const d = haversine(lat, lng, b.latitude, b.longitude);
      if (d < minD) { minD = d; closest = b; }
    }
  });
  return closest ? { branch: closest, distance: minD } : null;
}

// Calculate distance in kilometers between two lat/lng points using Haversine formula
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Escape HTML utility
function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Khmer spelling unicode normalization helper
function normalizeKhmer(str) {
  if (!str) return '';
  let normalized = str.normalize('NFC').trim();
  normalized = normalized.replace(/\u17C1\u17B8/g, '\u17BE');
  normalized = normalized.replace(/\u17C1\u17B6/g, '\u17C4');
  normalized = normalized.replace(/\u200B/g, '');
  normalized = normalized.replace(/\u17D2$/, '');
  normalized = normalized.replace(/[០-៩]/g, d => String.fromCharCode(d.charCodeAt(0) - 0x17E0 + 48));
  return normalized;
}

// Check for coordinate values
function parseCoordinates(q) {
  const match = q.match(/^[-+]?([1-9]?\d(\.\d+)?|90(\.0+)?),\s*[-+]?(180(\.0+)?|((1[0-7]\d)|([1-9]?\d))(\.\d+)?)$/);
  if (match) {
    const parts = q.split(',').map(num => parseFloat(num.trim()));
    return { lat: parts[0], lng: parts[1] };
  }
  return null;
}

// Structured ranking scoring algorithm for locations
function scoreCandidate(c, query) {
  let score = 0;
  const nameLower = (c.name || '').toLowerCase();
  const nameKhLower = (c.name_kh || '').toLowerCase();
  const qLower = query.toLowerCase();
  
  // 1. Match type ranking (Boost admin divisions and landmarks)
  if (c.source === 'ncdd') {
    // Exact admin division
    score += 1000;
  }
  
  // Boost landmarks (pagoda/wat, bridge, hospital, university, school, factory, borey)
  const isLandmark = /\b(wat|pagoda|bridge|hospital|university|school|rufa|itc|college|mosque|church|temple|monastery|factory|borey|buri)\b/i.test(nameLower) ||
                    /(វត្ត|ស្ពាន|មន្ទីរពេទ្យ|ពេទ្យ|សាកលវិទ្យាល័យ|សាលា|វិទ្យាល័យ|វិទ្យាស្ថាន|រោងចក្រ|បុរី)\b/i.test(nameKhLower);
  if (isLandmark) {
    score += 500;
  }
  
  // Boost markets
  const isMarket = /\b(market|phsar|psar)\b/i.test(nameLower) || /(ផ្សារ)\b/i.test(nameKhLower);
  if (isMarket) {
    score += 400;
  }
  
  // Boost streets
  const isStreet = /\b(street|st|road|way|boulevard|blvd|ផ្លូវ|មហាវិថី)\b/i.test(nameLower) || /(ផ្លូវ|មហាវិថី)\b/i.test(nameKhLower);
  if (isStreet) {
    score += 300;
  }
  
  // 2. Exact match boost: if the query matches the name exactly
  if (nameLower === qLower || nameKhLower === qLower) {
    score += 1000;
  } else if (nameLower.includes(qLower) || nameKhLower.includes(qLower)) {
    score += 200;
  }
  
  // 3. Prevent province jumping: if candidate province is Siem Reap or other provinces,
  // and the query does NOT mention it, but mentions Phnom Penh (or default to Phnom Penh boost)
  const mentionsPhnomPenh = qLower.includes('phnom penh') || qLower.includes('ភ្នំពេញ') || qLower.includes('pp');
  const candIsPhnomPenh = nameLower.includes('phnom penh') || (c.province && c.province.toLowerCase() === 'phnom penh') || (c.province_kh && c.province_kh === 'ភ្នំពេញ');
  
  if (candIsPhnomPenh) {
    score += 200; // General Phnom Penh bias since 90% of logistics data is in Phnom Penh
  } else {
    // Siem Reap / other provinces downranked if query doesn't explicitly mention them
    const mentionsSiemReap = qLower.includes('siem reap') || qLower.includes('សៀមរាប') || qLower.includes('sr');
    const candIsSiemReap = nameLower.includes('siem reap') || (c.province && c.province.toLowerCase() === 'siem reap');
    
  if (candIsSiemReap && !mentionsSiemReap) {
      score -= 800; // Major penalty to prevent province jumping!
    }
  }
  
  return score;
}

// ─── 1-CLICK COPY HELPER FUNCTIONS ──────────────────────────────────────────────
function copyTextWithToast(text, btn) {
  if (!text) return;
  const origText = btn.innerHTML;
  const origBg = btn.style.background;
  
  const handleSuccess = () => {
    btn.innerHTML = '✅ Copied!';
    btn.style.background = '#16a34a';
    setTimeout(() => {
      btn.innerHTML = origText;
      btn.style.background = origBg;
    }, 1500);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(handleSuccess).catch(() => {
      fallbackCopy(text, handleSuccess);
    });
  } else {
    fallbackCopy(text, handleSuccess);
  }
}

function fallbackCopy(text, cb) {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  if (cb) cb();
}

function copyRowDistrictCommune(index, btn) {
  const row = pmRows[index];
  if (!row) return;
  const dist = row.district_kh ? `${row.district_kh} (${row.district || ''})` : (row.district || '');
  const comm = row.commune_kh ? `${row.commune_kh} (${row.commune || ''})` : (row.commune || '');
  const text = `${dist}\t${comm}`;
  copyTextWithToast(text, btn);
}

function copyFullRowData(index, btn) {
  const row = pmRows[index];
  if (!row) return;
  const raw = row.rawText || '';
  const dist = row.district_kh ? `${row.district_kh} (${row.district || ''})` : (row.district || '');
  const comm = row.commune_kh ? `${row.commune_kh} (${row.commune || ''})` : (row.commune || '');
  const res = row.resolvedName || '';
  const po = row.nearestPo ? `${row.nearestPo.branch.store_name} (${row.nearestPo.branch.store_code})` : '';
  const text = `${raw}\t${dist}\t${comm}\t${res}\t${po}`;
  copyTextWithToast(text, btn);
}

function copyAllPmResults() {
  const pmCopyAllBtn = document.getElementById('pmCopyAllBtn');
  if (pmRows.length === 0) return;
  let text = "Line\tAddress Details\tDestination District (Khan)\tDestination Commune (Sangkat)\tNearby Match\tNearest Post Office Branch\tResolved Location\tStatus\n";
  pmRows.forEach((row, idx) => {
    const raw = (row.rawText || '').replace(/\t/g, ' ').replace(/\n/g, ' ');
    const dist = row.district_kh ? `${row.district_kh} (${row.district || ''})` : (row.district || '');
    const comm = row.commune_kh ? `${row.commune_kh} (${row.commune || ''})` : (row.commune || '');
    const poCode = row.nearestPo ? row.nearestPo.branch.store_code : '';
    const poBranch = row.nearestPo ? `${row.nearestPo.branch.store_name} (${row.nearestPo.distance < 1 ? Math.round(row.nearestPo.distance * 1000) + 'm' : row.nearestPo.distance.toFixed(1) + 'km'})` : '';
    const res = (row.resolvedName || '').replace(/\t/g, ' ');
    const status = row.status || '';
    text += `${idx + 1}\t${raw}\t${dist}\t${comm}\t${poCode}\t${poBranch}\t${res}\t${status}\n`;
  });
  copyTextWithToast(text, pmCopyAllBtn);
}
