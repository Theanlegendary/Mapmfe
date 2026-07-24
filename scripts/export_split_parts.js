/**
 * SPLIT BRANCH TEXT FILES INTO EASY 2-PART CHUNKS FOR AI WEBBOTS
 * 1. Part 1 (Branches 1 to 350)
 * 2. Part 2 (Branches 351 to 697)
 * Uploads both to dpaste.com and returns direct raw text URLs!
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const jsonInputPath = path.join(DATA_DIR, 'pickup_branches_with_keywords.json');
const branches = JSON.parse(fs.readFileSync(jsonInputPath, 'utf-8'));

console.log(`=== SPLITTING ${branches.length} BRANCHES INTO 2 COMPACT PARTS FOR AI ===`);

function buildPartTxt(branchList, title) {
  let txt = `================================================================================\r\n`;
  txt += `${title}\r\n`;
  txt += `Count: ${branchList.length} Branches\r\n`;
  txt += `================================================================================\r\n\r\n`;

  branchList.forEach((b, idx) => {
    const enKw = b.english_keywords_12km || [];
    const pipeEn = enKw.join(' | ');

    txt += `[BRANCH ${b.store_code}]\r\n`;
    txt += `Code      : ${b.store_code || ''}\r\n`;
    txt += `Name      : ${b.store_name || ''}\r\n`;
    txt += `Province  : ${b.province_kh || ''}\r\n`;
    txt += `District  : ${b.district_en || ''} (${b.district_kh || ''})\r\n`;
    txt += `Commune   : ${b.commune_kh || ''} (NCDD: ${b.commune_code || ''})\r\n`;
    txt += `Location  : ${b.latitude || ''}, ${b.longitude || ''}\r\n`;
    txt += `Keywords  : ${pipeEn}\r\n`;
    txt += `--------------------------------------------------------------------------------\r\n\r\n`;
  });

  return txt;
}

const part1Branches = branches.slice(0, 350);
const part2Branches = branches.slice(350);

const part1Txt = buildPartTxt(part1Branches, 'PICKUP BRANCHES PART 1 (BRANCHES 1 - 350)');
const part2Txt = buildPartTxt(part2Branches, 'PICKUP BRANCHES PART 2 (BRANCHES 351 - 697)');

const p1Path = path.join(ROOT_DIR, 'BRANCH_KEYWORDS_PART1.txt');
const p2Path = path.join(ROOT_DIR, 'BRANCH_KEYWORDS_PART2.txt');

fs.writeFileSync(p1Path, part1Txt, 'utf-8');
fs.writeFileSync(p2Path, part2Txt, 'utf-8');

console.log('✅ Saved BRANCH_KEYWORDS_PART1.txt');
console.log('✅ Saved BRANCH_KEYWORDS_PART2.txt');

async function uploadToDpaste(title, content) {
  const formData = new FormData();
  formData.append('title', title);
  formData.append('content', content);
  formData.append('expiry', '2592000'); // 30 Days

  const res = await fetch('https://dpaste.com/api/v2/', {
    method: 'POST',
    headers: { 'User-Agent': 'MetfoneGenRouteEngine/1.0' },
    body: formData
  });

  if (res.ok) {
    const pasteUrl = (await res.text()).trim();
    return pasteUrl + '.txt'; // append .txt for raw text mode
  } else {
    throw new Error(`Failed status ${res.status}`);
  }
}

async function runUpload() {
  try {
    const urlP1 = await uploadToDpaste('Pickup Branches Part 1', part1Txt);
    const urlP2 = await uploadToDpaste('Pickup Branches Part 2', part2Txt);

    console.log('\n=== DIRECT RAW PASTEBIN URLS FOR AI ===');
    console.log('Part 1 Raw Link (1-350)  :', urlP1);
    console.log('Part 2 Raw Link (351-697):', urlP2);

    const summary = `DIRECT AI PASTEBIN LINKS:\r\n\r\nPart 1 (Branches 1 - 350):\r\n${urlP1}\r\n\r\nPart 2 (Branches 351 - 697):\r\n${urlP2}\r\n\r\nGitHub Raw File:\r\nhttps://raw.githubusercontent.com/Theanlegendary/Mapmfe/main/BRANCH_KEYWORDS_ENGLISH_ONLY.txt\r\n`;

    fs.writeFileSync(path.join(ROOT_DIR, 'AI_PASTE_LINKS.txt'), summary, 'utf-8');
  } catch (e) {
    console.error(e);
  }
}

runUpload();
