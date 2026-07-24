/**
 * FIX ALL BRANCH PROVINCE ASSIGNMENTS ACCORDING TO NCDD STANDARDS & PREFIX CODES
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const branchesPath = path.join(DATA_DIR, 'pickup_branches.json');
const jsonInputPath = path.join(DATA_DIR, 'pickup_branches_with_keywords.json');

const branches = JSON.parse(fs.readFileSync(jsonInputPath, 'utf-8'));
const ncdd = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'ncdd_hierarchy.json'), 'utf-8'));

console.log(`=== ACCURATELY ALIGNING PROVINCE TAGS FOR ALL ${branches.length} BRANCHES ===`);

// Official prefix to Province mapping
const prefixProvMap = {
  'BAN': { en: 'Banteay Meanchey', kh: 'បន្ទាយមានជ័យ' },
  'BAT': { en: 'Battambang', kh: 'បាត់ដំបង' },
  'KPC': { en: 'Kampong Cham', kh: 'កំពង់ចាម' },
  'KCH': { en: 'Kampong Chhnang', kh: 'កំពង់ឆ្នាំង' },
  'KSP': { en: 'Kampong Speu', kh: 'កំពង់ស្ពឺ' },
  'KTH': { en: 'Kampong Thom', kh: 'កំពង់ធំ' },
  'KPT': { en: 'Kampot', kh: 'កំពត' },
  'KAN': { en: 'Kandal', kh: 'កណ្តាល' },
  'KEP': { en: 'Kep', kh: 'កែប' },
  'KOH': { en: 'Koh Kong', kh: 'កោះកុង' },
  'KRA': { en: 'Kratie', kh: 'ក្រចេះ' },
  'MON': { en: 'Mondulkiri', kh: 'មណ្ឌលគិរី' },
  'OMC': { en: 'Otdar Meanchey', kh: 'ឧត្តរមានជ័យ' },
  'PAO': { en: 'Pailin', kh: 'ប៉ៃលិន' },
  'PAI': { en: 'Pailin', kh: 'ប៉ៃលិន' },
  'SIH': { en: 'Preah Sihanouk', kh: 'ព្រះសីហនុ' },
  'PRH': { en: 'Preah Vihear', kh: 'ព្រះវិហារ' },
  'PRV': { en: 'Prey Veng', kh: 'ព្រៃវែង' },
  'PUR': { en: 'Pursat', kh: 'ពោធិ៍សាត់' },
  'RAT': { en: 'Ratanakiri', kh: 'រតនគិរី' },
  'SIE': { en: 'Siem Reap', kh: 'សៀមរាប' },
  'STU': { en: 'Stung Treng', kh: 'ស្ទឹងត្រែង' },
  'SVA': { en: 'Svay Rieng', kh: 'ស្វាយរៀង' },
  'TAK': { en: 'Takeo', kh: 'តាកែវ' },
  'TKM': { en: 'Tboung Khmum', kh: 'ត្បូងឃ្មុំ' },
  'PNP': { en: 'Phnom Penh', kh: 'ភ្នំពេញ' }
};

let correctedCount = 0;

branches.forEach(b => {
  const code = (b.store_code || b.branch_id || '').toUpperCase();
  
  let target = null;
  for (const [prefix, info] of Object.entries(prefixProvMap)) {
    if (code.startsWith(prefix)) {
      target = info;
      break;
    }
  }

  if (target) {
    if (b.province_en !== target.en || b.province_kh !== target.kh) {
      b.province_en = target.en;
      b.province = target.en;
      b.province_kh = target.kh;
      correctedCount++;
    }
  }
});

console.log(`✅ Corrected ${correctedCount} Province Assignments across ${branches.length} branches.`);

// Save back to both JSON databases
fs.writeFileSync(branchesPath, JSON.stringify(branches, null, 2), 'utf-8');
fs.writeFileSync(jsonInputPath, JSON.stringify(branches, null, 2), 'utf-8');

console.log('✅ Saved clean data/pickup_branches.json & data/pickup_branches_with_keywords.json');
