/**
 * REBUILD PICKUP BRANCHES DATABASE FROM OFFICIAL MASTER EXCEL FILE:
 * PickupBranches_ALL_PICKUP_18.07_10H08.xlsx
 *
 * Rules:
 * 1. Authoritative source of all Metfone Express pickup branches.
 * 2. Parsed directly from "Delivery Store *" (Code - Name), Province *, District *, District KH, Latitude, Longitude.
 * 3. Handles swapped coordinates (when Lat > 100 and Lng is between 8..16).
 * 4. EXPLICIT DIRECTIVE: If Latitude or Longitude is missing, null, NaN, or out of Cambodia boundaries, REMOVE IT COMPLETELY ("remove leng..").
 * 5. Align Khmer province and district names with official NCDD gazetteers.
 */

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const excelFile = path.join(ROOT_DIR, 'PickupBranches_ALL_PICKUP_18.07_10H08.xlsx');

const provinceKhmerMap = {
  'Phnom Penh': 'ភ្នំពេញ',
  'Banteay Meanchey': 'បន្ទាយមានជ័យ',
  'Battambang': 'បាត់ដំបង',
  'Kampong Cham': 'កំពង់ចាម',
  'Kampong Chhnang': 'កំពង់ឆ្នាំង',
  'Kampong Speu': 'កំពង់ស្ពឺ',
  'Kampong Thom': 'កំពង់ធំ',
  'Kampot': 'កំពត',
  'Kandal': 'កណ្តាល',
  'Kep': 'កែប',
  'Koh Kong': 'កោះកុង',
  'Kratie': 'ក្រចេះ',
  'Mondulkiri': 'មណ្ឌលគិរី',
  'Mondul Kiri': 'មណ្ឌលគិរី',
  'Otdar Meanchey': 'ឧត្តរមានជ័យ',
  'Oddar Meanchey': 'ឧត្តរមានជ័យ',
  'Pailin': 'ប៉ៃលិន',
  'Preah Sihanouk': 'ព្រះសីហនុ',
  'Preah Vihear': 'ព្រះវិហារ',
  'Prey Veng': 'ព្រៃវែង',
  'Pursat': 'ពោធិ៍សាត់',
  'Ratanakiri': 'រតនគិរី',
  'Ratana Kiri': 'រតនគិរី',
  'Siem Reap': 'សៀមរាប',
  'Stung Treng': 'ស្ទឹងត្រែង',
  'Svay Rieng': 'ស្វាយរៀង',
  'Takeo': 'តាកែវ',
  'Tboung Khmum': 'ត្បូងឃ្មុំ'
};

async function rebuild() {
  console.log(`=== REBUILDING PICKUP BRANCHES DATABASE FROM OFFICIAL EXCEL ===`);
  console.log(`File: ${excelFile}`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(excelFile);
  const ws = wb.getWorksheet(1);

  const headers = [];
  ws.getRow(1).eachCell((cell, colNumber) => {
    headers.push({ colNumber, val: String(cell.value || '').trim() });
  });

  const getColIdx = (name) => headers.find(h => h.val.toLowerCase().includes(name.toLowerCase()))?.colNumber;

  const colProv = getColIdx('Province');
  const colDistEn = getColIdx('District *');
  const colDistKh = getColIdx('District KH');
  const colStore = getColIdx('Delivery Store');
  const colLat = getColIdx('Latitude');
  const colLng = getColIdx('Longitude');

  console.log(`Columns mapped: Prov=${colProv}, DistEn=${colDistEn}, DistKh=${colDistKh}, Store=${colStore}, Lat=${colLat}, Lng=${colLng}`);

  let totalRows = 0;
  let missingCoordsCount = 0;
  let swappedCount = 0;
  let invalidBoundsCount = 0;
  
  const cleanBranches = [];

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const storeRaw = String(row.getCell(colStore).value || '').trim();
    if (!storeRaw) continue;

    totalRows++;

    const provEn = String(row.getCell(colProv).value || '').trim();
    const distEn = String(row.getCell(colDistEn).value || '').trim();
    const distKh = String(row.getCell(colDistKh).value || '').trim();
    let rawLat = row.getCell(colLat).value;
    let rawLng = row.getCell(colLng).value;

    let storeCode = '';
    let storeName = '';

    if (storeRaw.includes(' - ')) {
      const parts = storeRaw.split(' - ');
      storeCode = parts[0].trim();
      storeName = parts.slice(1).join(' - ').trim();
    } else {
      storeCode = storeRaw;
      storeName = storeRaw;
    }

    let lat = parseFloat(rawLat);
    let lng = parseFloat(rawLng);

    // Auto-fix swapped coordinates (e.g. Lat: 104.91, Lng: 11.59 -> Lat: 11.59, Lng: 104.91)
    if (lat > 100 && lng > 8 && lng < 16) {
      const temp = lat;
      lat = lng;
      lng = temp;
      swappedCount++;
      console.log(`🔄 SWAPPED FIX: ${storeCode} - ${storeName} [Lat: ${lat}, Lng: ${lng}]`);
    }

    // Filter rule: Remove if no location coordinates exist ("remove leng..")
    if (rawLat === null || rawLng === null || isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) {
      missingCoordsCount++;
      console.log(`❌ REMOVED (No Location): ${storeCode} - ${storeName}`);
      continue;
    }

    if (lat < 8.0 || lat > 16.0 || lng < 101.0 || lng > 108.0) {
      invalidBoundsCount++;
      console.log(`❌ REMOVED (Out of Bounds): ${storeCode} - ${storeName} [Lat: ${lat}, Lng: ${lng}]`);
      continue;
    }

    const provKh = provinceKhmerMap[provEn] || provEn;

    cleanBranches.push({
      id: `po_${storeCode}`,
      store_code: storeCode,
      store_name: storeName,
      branch_id: storeCode,
      market: storeName,
      province: provEn,
      province_en: provEn,
      province_kh: provKh,
      district_en: distEn,
      district_kh: distKh,
      latitude: lat,
      longitude: lng,
      google_maps_url: `https://www.google.com/maps?q=${lat},${lng}`
    });
  }

  console.log(`\n=== REBUILD SUMMARY ===`);
  console.log(`Total Master Spreadsheet Rows: ${totalRows}`);
  console.log(`Fixed Swapped Coordinates: ${swappedCount}`);
  console.log(`Removed Missing Location Branches: ${missingCoordsCount}`);
  console.log(`Removed Invalid Coordinate Branches: ${invalidBoundsCount}`);
  console.log(`✅ Clean Authoritative Physical Branches Total: ${cleanBranches.length}`);

  // Save clean json files
  fs.writeFileSync(path.join(DATA_DIR, 'pickup_branches.json'), JSON.stringify(cleanBranches, null, 2), 'utf-8');
  fs.writeFileSync(path.join(DATA_DIR, 'pickup_branches_with_keywords.json'), JSON.stringify(cleanBranches, null, 2), 'utf-8');

  console.log('✅ Updated data/pickup_branches.json & data/pickup_branches_with_keywords.json');
}

rebuild();
