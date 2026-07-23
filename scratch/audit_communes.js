const fs = require('fs');

const pathCurated = './data/curated_landmarks.json';
const pathMarkets = './data/famous_markets.json';

const curated = JSON.parse(fs.readFileSync(pathCurated, 'utf8'));
const markets = JSON.parse(fs.readFileSync(pathMarkets, 'utf8'));

let curatedMissingCommune = curated.filter(item => !item.commune_kh && !item.commune);
let marketsMissingCommune = markets.filter(item => !item.commune_kh && !item.commune);

console.log(`Curated missing commune: ${curatedMissingCommune.length} / ${curated.length}`);
console.log(`Markets missing commune: ${marketsMissingCommune.length} / ${markets.length}`);

// Print sample items missing commune
if (curatedMissingCommune.length > 0) {
  console.log('Sample curated missing commune:', curatedMissingCommune.slice(0, 10).map(i => ({ id: i.id, name: i.market_kh || i.market, district: i.district_kh })));
}

if (marketsMissingCommune.length > 0) {
  console.log('Sample markets missing commune:', marketsMissingCommune.slice(0, 10).map(i => ({ id: i.id, name: i.market_kh || i.market, district: i.district_kh })));
}
