/**
 * Entity Extractor for Khmer Natural-Language Addresses
 * 
 * Extracts location entities from natural-language sentences like:
 * "ផ្ទះនៅជិតផ្សារទួលពង្រ ក្បែរបុរីភ្នំពេញផាក"
 * 
 * Entities extracted: village, commune, market, pagoda, road, bridge, borey, hospital, university
 */

const FILLER_WORDS = [
  'ផ្ទះនៅ', 'ផ្ទះ', 'នៅ', 'ជិត', 'ក្បែរ', 'ខាងក្រោយ', 'ទល់មុខ', 'ច្រកចូល', 'ទីតាំង', 'ម្ដុំ',
  'ខាងលើ', 'ខាងក្រោម', 'ខាងឆ្វេង', 'ខាងស្ដាំ', 'ខាងមុខ', 'ខាងកើត', 'ខាងលិច',
  'ពីលើ', 'ពីក្រោម', 'ពីមុខ', 'ពីក្រោយ', 'ចូល', 'ចេញ', 'ឆ្ពោះទៅ', 'តាម',
  'និង', 'ឬ', 'ដែល', 'នោះ', 'នេះ', 'ហ្នឹង', 'ហ្នឹងហើយ',
  'near', 'nearby', 'next to', 'behind', 'in front of', 'across from',
  'close to', 'around', 'beside', 'adjacent to', 'opposite', 'at the',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'located', 'standing'
];

const LOCATION_PATTERNS = {
  village: {
    prefixes: ['ភូមិ', 'village'],
    patterns: [/ភូមិ\s*([^\s,]+)/gi, /village\s+(?:of\s+)?([^\s,]+)/gi]
  },
  commune: {
    prefixes: ['ឃុំ', 'សង្កាត់', 'commune', 'sangkat'],
    patterns: [/ឃុំ\s*([^\s,]+)/gi, /សង្កាត់\s*([^\s,]+)/gi, /commune\s+(?:of\s+)?([^\s,]+)/gi, /sangkat\s+([^\s,]+)/gi]
  },
  district: {
    prefixes: ['ស្រុក', 'ខណ្ឌ', 'ក្រុង', 'district', 'khan'],
    patterns: [/ស្រុក\s*([^\s,]+)/gi, /ខណ្ឌ\s*([^\s,]+)/gi, /ក្រុង\s*([^\s,]+)/gi, /district\s+(?:of\s+)?([^\s,]+)/gi, /khan\s+([^\s,]+)/gi]
  },
  province: {
    prefixes: ['ខេត្ត', 'រាជធានី', 'province'],
    patterns: [/ខេត្ត\s*([^\s,]+)/gi, /រាជធានី\s*([^\s,]+)/gi, /province\s+(?:of\s+)?([^\s,]+)/gi]
  },
  market: {
    prefixes: ['ផ្សារ', 'market', 'phsar', 'psar'],
    patterns: [/ផ្សារ\s*([^\s,]+(?:\s+[^\s,]+){0,2})/gi, /market\s+(?:of\s+)?([^\s,]+(?:\s+[^\s,]+){0,2})/gi, /phsar\s+([^\s,]+)/gi, /psar\s+([^\s,]+)/gi]
  },
  pagoda: {
    prefixes: ['វត្ត', 'pagoda', 'wat'],
    patterns: [/វត្ត\s*([^\s,]+(?:\s+[^\s,]+){0,1})/gi, /pagoda\s+(?:of\s+)?([^\s,]+(?:\s+[^\s,]+){0,1})/gi, /wat\s+([^\s,]+)/gi]
  },
  road: {
    prefixes: ['ផ្លូវ', 'street', 'road', 'st', 'rd'],
    patterns: [/ផ្លូវ\s*(\d+[a-zA-Z]?)/gi, /street\s+(\d+[a-zA-Z]?)/gi, /road\s+(\d+[a-zA-Z]?)/gi, /\bst\.?\s*(\d+[a-zA-Z]?)/gi, /\brd\.?\s*(\d+[a-zA-Z]?)/gi]
  },
  bridge: {
    prefixes: ['ស្ពាន', 'bridge'],
    patterns: [/ស្ពាន\s*([^\s,]+)/gi, /bridge\s+(?:of\s+)?([^\s,]+)/gi]
  },
  borey: {
    prefixes: ['បុរី', 'borey'],
    patterns: [/បុរី\s*([^\s,]+(?:\s+[^\s,]+){0,2})/gi, /borey\s+([^\s,]+(?:\s+[^\s,]+){0,2})/gi]
  },
  hospital: {
    prefixes: ['មន្ទីរពេទ្យ', 'hospital', 'clinic'],
    patterns: [/មន្ទីរពេទ្យ\s*([^\s,]+(?:\s+[^\s,]+){0,2})/gi, /hospital\s+(?:of\s+)?([^\s,]+(?:\s+[^\s,]+){0,2})/gi, /clinic\s+([^\s,]+)/gi]
  },
  university: {
    prefixes: ['សាកលវិទ្យាល័យ', 'universit', 'institute'],
    patterns: [/សាកលវិទ្យាល័យ\s*([^\s,]+(?:\s+[^\s,]+){0,3})/gi, /university\s+(?:of\s+)?([^\s,]+(?:\s+[^\s,]+){0,3})/gi, /institute\s+(?:of\s+)?([^\s,]+(?:\s+[^\s,]+){0,2})/gi]
  },
  school: {
    prefixes: ['សាលា', 'school'],
    patterns: [/សាលា\s*([^\s,]+(?:\s+[^\s,]+){0,2})/gi, /school\s+(?:of\s+)?([^\s,]+(?:\s+[^\s,]+){0,2})/gi]
  },
  landmark: {
    prefixes: [],
    patterns: []
  }
};

const KNOWN_LANDMARKS = {
  'ទួលពង្រ': { type: 'market', aliases: ['tuol pong ro', 'tol pong ro', 'tuol pongror'] },
  'អាដហ្ស៊ី': { type: 'market', aliases: ['adz', 'adji'] },
  'ធួនថៃ': { type: 'market', aliases: ['thai'] },
  'ព្រៃទា': { type: 'market', aliases: ['prey ta', 'prei ta'] },
  'ត្រពាំងល្វា': { type: 'village', aliases: ['trapang lviea', 'trapaing lvea'] },
  'ធំថ្មី': { type: 'market', aliases: ['thmey', 'thmai'] },
  'ដេប៉ូ': { type: 'market', aliases: ['depo', 'depot'] },
  'ឫស្សីកែវ': { type: 'market', aliases: ['russei keo', 'russey keo'] },
  'ឬស្សីកែវ': { type: 'market', aliases: ['russei keo', 'russey keo'] },
  'ភ្នំពេញផាក': { type: 'borey', aliases: ['phnom penh park', 'phnom penh'] },
  'សុណិន': { type: 'borey', aliases: ['borey sony', 'sony'] },
  'វីជី': { type: 'borey', aliases: ['vigi', 'vg'] },
  'អារីយ៉ា': { type: 'landmark', aliases: ['aria', 'ary'] },
  'សង្ហារឹម': { type: 'landmark', aliases: ['sangkream'] },
  'ម៉ាលីន': { type: 'landmark', aliases: ['maline'] },
  'ស្តារគ្វាទៀរ': { type: 'landmark', aliases: ['the star quateria', 'star quateria', 'the star'] },
  'គ្វាទៀរ': { type: 'landmark', aliases: ['quateria'] },
};

function normalizeText(text) {
  if (!text) return '';
  return text.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function removeFillerWords(text) {
  if (!text) return '';
  let cleaned = text;
  const sortedFillers = [...FILLER_WORDS].sort((a, b) => b.length - a.length);
  for (const filler of sortedFillers) {
    const regex = new RegExp(`\\b${filler}\\b`, 'gi');
    cleaned = cleaned.replace(regex, ' ');
  }
  return cleaned.replace(/\s+/g, ' ').trim();
}

function extractEntities(text) {
  if (!text || typeof text !== 'string') return [];
  const entities = [];
  const normalizedText = normalizeText(text);
  const cleanedText = removeFillerWords(normalizedText);
  const matchedRanges = [];
  
  for (const [entityType, config] of Object.entries(LOCATION_PATTERNS)) {
    if (!config.patterns || config.patterns.length === 0) continue;
    for (const pattern of config.patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(cleanedText)) !== null) {
        const value = match[1] ? match[1].trim() : '';
        const fullMatch = match[0].trim();
        if (value && value.length >= 2) {
          const startIdx = match.index;
          const endIdx = startIdx + fullMatch.length;
          const overlaps = matchedRanges.some(r => 
            (startIdx >= r.start && startIdx < r.end) ||
            (endIdx > r.start && endIdx <= r.end) ||
            (startIdx <= r.start && endIdx >= r.end)
          );
          if (!overlaps) {
            entities.push({ type: entityType, value: value, original: fullMatch, score: 100 });
            matchedRanges.push({ start: startIdx, end: endIdx });
          }
        }
      }
    }
  }

  for (const [landmark, config] of Object.entries(KNOWN_LANDMARKS)) {
    const normLandmark = normalizeText(landmark);
    if (cleanedText.includes(normLandmark)) {
      const alreadyMatched = entities.some(e => normalizeText(e.value).includes(normLandmark));
      if (!alreadyMatched) {
        entities.push({ type: config.type, value: landmark, original: landmark, score: 90 });
      }
    }
  }

  entities.sort((a, b) => b.score - a.score);
  return entities;
}

module.exports = {
  extractEntities,
  removeFillerWords,
  normalizeText,
  LOCATION_PATTERNS,
  KNOWN_LANDMARKS
};
