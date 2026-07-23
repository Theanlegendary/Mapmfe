const fs = require('fs');

const pathCurated = './data/curated_landmarks.json';
const pathMarkets = './data/famous_markets.json';
const pathRoutes = './data/routes.json';

const curated = JSON.parse(fs.readFileSync(pathCurated, 'utf8'));
const markets = JSON.parse(fs.readFileSync(pathMarkets, 'utf8'));
const routes = JSON.parse(fs.readFileSync(pathRoutes, 'utf8'));

// Build lookup dictionary from routes
const districtToCommuneMap = new Map();

routes.forEach(r => {
  if (r.district_kh && r.commune_kh) {
    const key = r.district_kh.trim();
    if (!districtToCommuneMap.has(key)) {
      districtToCommuneMap.set(key, { kh: r.commune_kh.trim(), en: r.commune ? r.commune.trim() : '' });
    }
  }
});

// Explicit commune overrides for famous landmarks
const landmarkCommuneMap = {
  "វត្តភ្នំ": { kh: "វត្តភ្នំ", en: "Wat Phnom" },
  "ផ្សារធំថ្មី": { kh: "ផ្សារថ្មីទី១", en: "Phsar Thmei 1" },
  "ផ្សារទួលទំពូង": { kh: "ទួលទំពូងទី១", en: "Tuol Tom Poung 1" },
  "ផ្សារអូរឫស្សី": { kh: "អូរឫស្សីទី១", en: "Orussey 1" },
  "ផ្សារអូឡាំពិក": { kh: "អូឡាំពិច", en: "Olympic" },
  "ផ្សាររាត្រីភ្នំពេញ": { kh: "វត្តភ្នំ", en: "Wat Phnom" },
  "ផ្សារចាស់ (ភ្នំពេញ)": { kh: "ផ្សារចាស់", en: "Phsar Chas" },
  "ស្ពានជ្រោយចង្វា": { kh: "ជ្រោយចង្វារ", en: "Chroy Changvar" },
  "ស្ពានអាកាសស្ទឹងមានជ័យ": { kh: "ស្ទឹងមានជ័យទី១", en: "Steung Meanchey 1" },
  "ស្ពានព្រះមុនីវង្ស": { kh: "ច្បារអំពៅទី១", en: "Chbar Ampov 1" },
  "ស្ពានអ្នកលឿង": { kh: "ព្រែកខ្សាយ ប", en: "Prek Khsay B" },
  "ស្ពានគីហ្សូណា": { kh: "វាលវង់", en: "Veal Vong" },
  "អាកាសយានដ្ឋានអន្តរជាតិភ្នំពេញ": { kh: "កាកាបទី១", en: "Kakab 1" },
  "អាកាសយានដ្ឋានអន្តរជាតិសៀមរាបអង្គរ": { kh: "តាយ៉ែក", en: "Tayek" },
  "មន្ទីរពេទ្យកាល់ម៉ែត": { kh: "ស្រះចក", en: "Srah Chork" },
  "មន្ទីរពេទ្យមិត្តភាពខ្មែរ-សូវៀត": { kh: "ទំនប់ទឹក", en: "Tumnob Teuk" },
  "មន្ទីរពេទ្យព្រះកេតុមាលា": { kh: "វត្តភ្នំ", en: "Wat Phnom" },
  "មន្ទីរពេទ្យព្រះអង្គឌួង": { kh: "វត្តភ្នំ", en: "Wat Phnom" },
  "មន្ទីរពេទ្យកុមារគន្ធបុប្ផា": { kh: "វត្តភ្នំ", en: "Wat Phnom" },
  "មន្ទីរពេទ្យចោរ៉ៃភ្នំពេញ": { kh: "និរោធ", en: "Niroth" },
  "មន្ទីរពេទ្យស៊ុនរ៉ាយ": { kh: "ស្រះចក", en: "Srah Chork" },
  "មន្ទីរពេទ្យ ១៦៨": { kh: "បឹងទំពុនទី១", en: "Boeng Tumpun 1" },
  "មហាវាំង": { kh: "ជ័យជំនះ", en: "Chey Chumneah" },
  "សារមន្ទីរជាតិ": { kh: "ជ័យជំនះ", en: "Chey Chumneah" },
  "វិមានឯករាជ្យ": { kh: "បឹងកេងកងទី១", en: "Boeng Keng Kang 1" },
  "ពហុកីឡដ្ឋានជាតិអូឡាំពិក": { kh: "វាលវង់", en: "Veal Vong" },
  "ពហុកីឡដ្ឋានជាតិមរតកតេជោ": { kh: "បាក់ខែង", en: "Bak Kheng" },
  "កោះពេជ្រ": { kh: "ទន្លេបាសាក់", en: "Tonle Bassac" },
  "កោះនរា": { kh: "និរោធ", en: "Niroth" },
  "កោះអូរញ៉ាExternal": { kh: "កោះអន្លង់ចិន", en: "Koh Anlong Chen" },
  "អ៊ីអន ម៉ល ភ្នំពេញ (AEON 1)": { kh: "ទន្លេបាសាក់", en: "Tonle Bassac" },
  "អ៊ីអន ម៉ល សែនសុខ (AEON 2)": { kh: "ភ្នំពេញថ្មី", en: "Phnom Penh Thmey" },
  "អ៊ីអន ម៉ល មានជ័យ (AEON 3)": { kh: "ចកអង្រែក្រោម", en: "Chak Angre Krom" },
  "ជីប ម៉ុង ២៧១ ម៉េហ្គាម៉ល": { kh: "បឹងទំពុនទី២", en: "Boeng Tumpun 2" },
  "វឌ្ឍនៈ កាពីតាល់": { kh: "វត្តភ្នំ", en: "Wat Phnom" },
  "កាណាឌីយ៉ា ថៅវើ": { kh: "វត្តភ្នំ", en: "Wat Phnom" },
  "អគារការិយាល័យកណ្តាល ABA": { kh: "បឹងកេងកងទី១", en: "Boeng Keng Kang 1" },
  "អគារការិយាល័យកណ្តាល Wing": { kh: "ស្រះចក", en: "Srah Chork" },
  "អគារការិយាល័យកណ្តាល ACLEDA": { kh: "ទឹកថ្លា", en: "Teuk Thla" },
  "សេដ្ឋាបនី ថៅវើ": { kh: "បឹងកេងកងទី១", en: "Boeng Keng Kang 1" },
  "សាកលវិទ្យាល័យភូមិន្ទភ្នំពេញ (RUPP)": { kh: "ទឹកថ្លា", en: "Teuk Thla" },
  "សាកលវិទ្យាល័យភូមិន្ទនីតិសាស្ត្រ និងវិទ្យាសាស្ត្រសេដ្ឋកិច្ច (RULE)": { kh: "ផ្សារដើមថ្កូវ", en: "Phsar Daeum Thkov" },
  "សាកលវិទ្យាល័យជាតិគ្រប់គ្រង (NUM)": { kh: "វត្តភ្នំ", en: "Wat Phnom" },
  "សាកលវិទ្យាល័យភូមិន្ទកសិកម្ម (RUA)": { kh: "ចំការដូង", en: "Chamkar Doung" },
  "វិទ្យាស្ថានភាសាបរទេស (IFL)": { kh: "ទឹកថ្លា", en: "Teuk Thla" },
  "សាកលវិទ្យាល័យន័រតុន": { kh: "ជ្រោយចង្វារ", en: "Chroy Changvar" },
  "សាកលវិទ្យាល័យបញ្ញាសាស្ត្រ (PUC)": { kh: "បឹងកេងកងទី១", en: "Boeng Keng Kang 1" },
  "សាកលវិទ្យាល័យខេមធិច (CamTech)": { kh: "ជ្រោយចង្វារ", en: "Chroy Changvar" },
  "បណ្ឌិត្យសភាបច្ចេកវិទ្យាឌីជីថលកម្ពុជា (CADT)": { kh: "ព្រែកលៀប", en: "Prek Leap" },
  "ស្ពានក្បាលថ្នល់": { kh: "ផ្សារដើមថ្កូវ", en: "Phsar Daeum Thkov" },
  "ស្ពានអាកាស ៧ មករា": { kh: "ទឹកថ្លា", en: "Teuk Thla" },
  "ស្ពានអាកាស ៥ មករា": { kh: "ផ្សារដេប៉ូទី៣", en: "Phsar Depo 3" },
  "ស្ពានអាកាសចោមចៅ": { kh: "ចោមចៅទី៣", en: "Chom Chao 3" },
  "ស្ពានកោះនរា": { kh: "និរោធ", en: "Niroth" },
  "ស្ពានត្សឹបាសា (ស្ពានអ្នកលឿង)": { kh: "ព្រែកខ្សាយ ប", en: "Prek Khsay B" },
  "ស្ពានព្រែកតាមាក់": { kh: "ព្រែកតាមាក់", en: "Prek Ta Mak" },
  "ស្ពានកោះធំ": { kh: "កោះធំ ក", en: "Koh Thom A" },
  "ស្ពានស្ទឹងត្រែង": { kh: "ព្រែកមាស", en: "Prek Meas" },
  "ស្ពានសេកុង": { kh: "ស្ទឹងត្រែង", en: "Stung Treng" },
  "ស្ពានព្រែកក្តាម": { kh: "កោះចិន", en: "Koh Chen" },
  "ស្ពានតាខ្មៅ": { kh: "ព្រែកឬស្សី", en: "Prek Ruessei" }
};

// Auto-fill Curated Landmarks
curated.forEach(item => {
  const nameKey = item.market_kh || item.market || '';
  if (landmarkCommuneMap[nameKey]) {
    item.commune_kh = landmarkCommuneMap[nameKey].kh;
    item.commune = landmarkCommuneMap[nameKey].en;
  } else if (!item.commune_kh && !item.commune) {
    const dKey = (item.district_kh || '').trim();
    if (districtToCommuneMap.has(dKey)) {
      const fallback = districtToCommuneMap.get(dKey);
      item.commune_kh = fallback.kh;
      item.commune = fallback.en;
    } else {
      item.commune_kh = item.district_kh || item.district || 'ភ្នំពេញ';
      item.commune = item.district || item.province || 'Phnom Penh';
    }
  }
});

// Auto-fill Famous Markets
markets.forEach(item => {
  const nameKey = item.market_kh || item.market || '';
  if (landmarkCommuneMap[nameKey]) {
    item.commune_kh = landmarkCommuneMap[nameKey].kh;
    item.commune = landmarkCommuneMap[nameKey].en;
  } else if (!item.commune_kh && !item.commune) {
    const dKey = (item.district_kh || '').trim();
    if (districtToCommuneMap.has(dKey)) {
      const fallback = districtToCommuneMap.get(dKey);
      item.commune_kh = fallback.kh;
      item.commune = fallback.en;
    } else {
      item.commune_kh = item.district_kh || item.district || 'ភ្នំពេញ';
      item.commune = item.district || item.province || 'Phnom Penh';
    }
  }
});

fs.writeFileSync(pathCurated, JSON.stringify(curated, null, 2), 'utf8');
fs.writeFileSync(pathMarkets, JSON.stringify(markets, null, 2), 'utf8');

const remainingCuratedMissing = curated.filter(item => !item.commune_kh && !item.commune).length;
const remainingMarketsMissing = markets.filter(item => !item.commune_kh && !item.commune).length;

console.log(`✅ Successfully updated all landmarks & markets!`);
console.log(`Remaining missing in curated: ${remainingCuratedMissing}`);
console.log(`Remaining missing in markets: ${remainingMarketsMissing}`);
