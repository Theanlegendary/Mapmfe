const fetch = require('node-fetch');

async function testVer() {
  const res = await fetch('https://mapmfe.vercel.app/pastemaster', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const html = await res.text();
  console.log('Contains v3.1.7 in live HTML:', html.includes('v3.1.7'));
  console.log('Contains v3.1.6 in live HTML:', html.includes('v3.1.6'));
  const match = html.match(/v3\.1\.\d/g);
  console.log('Version matches found:', match);
}

testVer();
