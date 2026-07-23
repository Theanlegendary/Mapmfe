const fs = require('fs');

const branches = JSON.parse(fs.readFileSync('./data/pickup_branches.json', 'utf8'));
const markets = JSON.parse(fs.readFileSync('./data/famous_markets.json', 'utf8'));

console.log('--- Post Office Branches in / near Sen Sok ---');
branches.filter(b => (b.district || '').toLowerCase().includes('sen sok') || (b.province || '').toLowerCase().includes('phnom penh')).forEach(b => {
  console.log(`ID: ${b.store_code} | Name: ${b.store_name} | Lat: ${b.latitude}, Lng: ${b.longitude}`);
});

console.log('\n--- Sensok Market Coordinates ---');
const sensokMarket = markets.find(m => (m.market_kh || '').includes('សែនសុខ'));
console.log(sensokMarket);
