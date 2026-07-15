const fs = require('fs');
const path = require('path');

// Mimic normalizeKhmer
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

function preprocessSpelling(q) {
  if (!q) return '';
  let cleaned = q.trim();
  cleaned = cleaned.replace(/\b(pshar|psar|phsa|psha|psa)\b/gi, 'phsar');
  cleaned = cleaned.replace(/\b(pshar|psar|phsa(?!r)|psha|psa)(?=[a-z])/gi, 'phsar ');
  return cleaned;
}

const famousMarkets = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'famous_markets.json'), 'utf-8'));

const query = 'បឹងកេងកង';

const processedQuery = preprocessSpelling(query);
const normQ = normalizeKhmer(processedQuery);
const normQuery = processedQuery.toLowerCase().replace(/[^a-z0-9]/g, '');

const matchedFamous = famousMarkets.filter(m => {
  const normMarket = normalizeKhmer(m.market);
  const normMarketKh = normalizeKhmer(m.market_kh);
  
  let matchesMarket = false;
  
  if (normQ) {
    if (normMarket.includes(normQ) || normMarketKh.includes(normQ)) {
      matchesMarket = true;
    }
    if (!matchesMarket && (m.aliases || []).some(a => normalizeKhmer(a).includes(normQ))) {
      matchesMarket = true;
    }
    if (!matchesMarket && (m.search_keywords || []).some(k => normalizeKhmer(k).includes(normQ))) {
      matchesMarket = true;
    }
  }

  if (!matchesMarket && normQuery) {
    const alphaMarket = m.market.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (alphaMarket && alphaMarket.includes(normQuery)) {
      matchesMarket = true;
    }
    if (!matchesMarket && (m.aliases || []).some(a => {
      const alphaA = a.toLowerCase().replace(/[^a-z0-9]/g, '');
      return alphaA && alphaA.includes(normQuery);
    })) {
      matchesMarket = true;
    }
    if (!matchesMarket && (m.search_keywords || []).some(k => {
      const alphaK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
      return alphaK && (alphaK.includes(normQuery) || alphaK === normQuery);
    })) {
      matchesMarket = true;
    }
  }
  
  return matchesMarket;
});

console.log(`resolveCoords matched famous markets count: ${matchedFamous.length}`);
matchedFamous.forEach(m => {
  console.log(`  - Market: ${m.market}, Market KH: ${m.market_kh}`);
});
