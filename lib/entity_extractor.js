/**
 * Entity Extractor for Khmer Natural-Language Addresses
 * 
 * Extracts location entities from natural-language sentences like:
 * "ផ្ទះនៅជិតផ្សារទួលពង្រ ក្បែរបុរីភ្នំពេញផាក"
 * 
 * Entities extracted: village, commune, market, pagoda, road, bridge, borey, hospital, university
 */

// Filler words to remove (these don't carry location meaning)
const FILLER_WORDS = [
  // Khmer filler/preposition words
  'ផ្ទះនៅ', 'ផ្ទះ', 'នៅ', 'ជិត', 'ក្បែរ', 'ខាងក្រោយ', 'ទល់មុខ', 'ច្រកចូល', 'ទីតាំង', 'ម្ដុំ',
  'ខាងលើ', 'ខាងក្រោម', 'ខាងឆ្វេង', 'ខាងស្ដាំ', 'ខាងមុខ', 'ខាងកើត', 'ខាងលិច',
  'ពីលើ', 'ពីក្រោម', 'ពីមុខ', 'ពីក្រោយ', 'ចូល', 'ចេញ', 'ឆ្ពោះទៅ', 'តាម',
  'និង', 'ឬ', 'ដែល', 'នោះ', 'នេះ', 'ហ្នឹង', 'ហ្នឹងហើយ',
  // English filler words
  'near', 'nearby', 'next to', 'behind', 'in front of', 'across from',
  'close to', 'around', 'beside', 'adjacent to', 'opposite', 'at the',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'located', 'standing'
];

// Location type patterns (prefix/suffix markers that indicate entity types)
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
    // Named landmarks without prefixes - use known landmark patterns
    patterns: []
  }
};

// Well-known landmarks that should be recognized even without prefixes
const KNOWN_LANDMARKS = {
  // Famous markets (these may appear without "ផ្សារ" prefix in speech)
  'ទួលពង្រ': { type: 'market', aliases: ['tuol pong ro', 'tol pong ro', 'tuol pongror'] },
  'អាដហ្ស៊ី': { type: 'market', aliases: ['adz', 'adji'] },
  'ធួនថៃ': { type: 'market', aliases: ['thai'] },
  'ព្រៃទា': { type: 'market', aliases: ['prey ta', 'prei ta'] },
  'ត្រពាំងល្វា': { type: 'village', aliases: ['trapang lviea', 'trapaing lvea'] },
  'ធំថ្មី': { type: 'market', aliases: ['thmey', 'thmai'] },
  'ដេប៉ូ': { type: 'market', aliases: ['depo', 'depot'] },
  'ឫស្សីកែវ': { type: 'market', aliases: ['russei keo', 'russey keo'] },
  'ឬស្សីកែវ': { type: 'market', aliases: ['russei keo', 'russey keo'] },
  
  // Boreys
  'ភ្នំពេញផាក': { type: 'borey', aliases: ['phnom penh park', 'phnom penh'] },
  'សុណិន': { type: 'borey', aliases: ['borey sony', 'sony'] },
  'វីជី': { type: 'borey', aliases: ['vigi', 'vg'] },
  
  // Shopping centers
  'អារីយ៉ា': { type: 'landmark', aliases: ['aria', 'ary'] },
  'សង្ហារឹម': { type: 'landmark', aliases: ['sangkream'] },
  'ម៉ាលីន': { type: 'landmark', aliases: ['maline'] },
  
  // The Star
  'ស្តារគ្វាទៀរ': { type: 'landmark', aliases: ['the star quateria', 'star quateria', 'the star'] },
  'គ្វាទៀរ': { type: 'landmark', aliases: ['quateria'] },
};

/**
 * Normalize text for comparison
 */
function normalizeText(text) {
  if (!text) return '';
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Remove filler words from text
 */
function removeFillerWords(text) {
  if (!text) return '';
  let cleaned = text;
  
  // Sort filler words by length (longest first) to avoid partial replacements
  const sortedFillers = [...FILLER_WORDS].sort((a, b) => b.length - a.length);
  
  for (const filler of sortedFillers) {
    // Case-insensitive replacement
    const regex = new RegExp(`\\b${filler}\\b`, 'gi');
    cleaned = cleaned.replace(regex, ' ');
  }
  
  // Clean up multiple spaces
  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Extract entities from a natural-language address
 * @param {string} text - The input text to extract entities from
 * @returns {Array<{type: string, value: string, original: string, score: number}>}
 */
function extractEntities(text) {
  if (!text || typeof text !== 'string') return [];
  
  const entities = [];
  const normalizedText = normalizeText(text);
  const cleanedText = removeFillerWords(normalizedText);
  
  // Track which parts of text have been matched (to avoid overlapping matches)
  const matchedRanges = [];
  
  // Extract entities by pattern matching
  for (const [entityType, config] of Object.entries(LOCATION_PATTERNS)) {
    if (!config.patterns || config.patterns.length === 0) continue;
    
    for (const pattern of config.patterns) {
      // Reset regex lastIndex
      pattern.lastIndex = 0;
      
      let match;
      while ((match = pattern.exec(cleanedText)) !== null) {
        const value = match[1] ? match[1].trim() : '';
        const fullMatch = match[0].trim();
        
        if (value && value.length >= 2) {
          // Check for overlapping matches
          const startIdx = match.index;
          const endIdx = startIdx + fullMatch.length;
          
          const overlaps = matchedRanges.some(r => 
            (startIdx >= r.start && startIdx < r.end) ||
            (endIdx > r.start && endIdx <= r.end) ||
            (startIdx <= r.start && endIdx >= r.end)
          );
          
          if (!overlaps) {
            entities.push({
              type: entityType,
              value: value,
              original: fullMatch,
              score: 100 // Base score for pattern match
            });
            matchedRanges.push({ start: startIdx, end: endIdx });
          }
        }
      }
    }
  }
  
  // Check for known landmarks without prefixes
  for (const [landmark, config] of Object.entries(KNOWN_LANDMARKS)) {
    const normLandmark = normalizeText(landmark);
    
    // Check if landmark appears in cleaned text
    if (cleanedText.includes(normLandmark)) {
      // Check if already matched by a pattern
      const alreadyMatched = entities.some(e => 
        normalizeText(e.value).includes(normLandmark) || 
        normalizeText(e.original).includes(normLandmark)
      );
      
      if (!alreadyMatched) {
        entities.push({
          type: config.type,
          value: landmark,
          original: landmark,
          score: 90 // Slightly lower score than pattern match
        });
      }
    }
    
    // Check aliases
    for (const alias of (config.aliases || [])) {
      const normAlias = normalizeText(alias);
      if (cleanedText.includes(normAlias) && normAlias.length >= 3) {
        const alreadyMatched = entities.some(e => 
          normalizeText(e.value).includes(normAlias) || 
          normalizeText(e.original).includes(normAlias)
        );
        
        if (!alreadyMatched) {
          entities.push({
            type: config.type,
            value: landmark, // Use the Khmer name as the value
            original: alias,
            score: 85 // Lower score for alias match
          });
        }
      }
    }
  }
  
  // Sort entities by score (highest first), then by position in text
  entities.sort((a, b) => b.score - a.score);
  
  return entities;
}

/**
 * Get the most important entity for search
 * Priority: market > borey > landmark > pagoda > village > commune > district > road
 */
function getPrimaryEntity(entities) {
  if (!entities || entities.length === 0) return null;
  
  // Priority order for entity types
  const priority = ['market', 'borey', 'landmark', 'hospital', 'university', 'pagoda', 'village', 'commune', 'district', 'road', 'province'];
  
  // Sort by priority
  const sorted = [...entities].sort((a, b) => {
    const aPriority = priority.indexOf(a.type);
    const bPriority = priority.indexOf(b.type);
    
    // If same priority, use score
    if (aPriority === bPriority) {
      return b.score - a.score;
    }
    
    // Lower index = higher priority
    return (aPriority === -1 ? 999 : aPriority) - (bPriority === -1 ? 999 : bPriority);
  });
  
  return sorted[0];
}

/**
 * Generate search queries from extracted entities
 * Returns multiple query variations to improve search accuracy
 */
function generateSearchQueries(entities) {
  if (!entities || entities.length === 0) return [];
  
  const queries = [];
  
  // Primary entity alone
  const primary = getPrimaryEntity(entities);
  if (primary) {
    queries.push({
      query: primary.value,
      type: primary.type,
      isPrimary: true,
      entityCount: 1
    });
  }
  
  // All entities combined (for multi-entity ranking)
  if (entities.length > 1) {
    const allValues = entities.map(e => e.value).join(' ');
    queries.push({
      query: allValues,
      type: 'combined',
      isPrimary: false,
      entityCount: entities.length,
      entities: entities
    });
  }
  
  // Pair combinations (for ranking candidates that match both)
  if (entities.length >= 2) {
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        queries.push({
          query: `${entities[i].value} ${entities[j].value}`,
          type: 'pair',
          isPrimary: false,
          entityCount: 2,
          entities: [entities[i], entities[j]]
        });
      }
    }
  }
  
  return queries;
}

/**
 * Score candidates based on how many entities they match
 */
function scoreCandidatesByEntities(candidates, entities) {
  if (!entities || entities.length === 0) return candidates;
  
  return candidates.map(candidate => {
    let entityMatchScore = 0;
    const matchedEntities = [];
    
    const candidateText = normalizeText(`${candidate.market || ''} ${candidate.market_kh || ''} ${candidate.name || ''} ${candidate.name_kh || ''} ${candidate.village || ''} ${candidate.village_kh || ''} ${candidate.commune || ''} ${candidate.commune_kh || ''}`);
    
    for (const entity of entities) {
      const entityNorm = normalizeText(entity.value);
      
      // Check if candidate matches this entity
      if (candidateText.includes(entityNorm)) {
        entityMatchScore += entity.score;
        matchedEntities.push(entity);
      }
      
      // Also check aliases for known landmarks
      const landmarkConfig = KNOWN_LANDMARKS[entity.value];
      if (landmarkConfig && landmarkConfig.aliases) {
        for (const alias of landmarkConfig.aliases) {
          if (candidateText.includes(normalizeText(alias))) {
            entityMatchScore += entity.score * 0.5; // Partial score for alias match
            matchedEntities.push(entity);
            break;
          }
        }
      }
    }
    
    // Boost score if matches multiple entities
    if (matchedEntities.length > 1) {
      entityMatchScore *= (1 + (matchedEntities.length - 1) * 0.3);
    }
    
    return {
      ...candidate,
      entityMatchScore,
      matchedEntityCount: matchedEntities.length,
      matchedEntities
    };
  }).sort((a, b) => {
    // Primary sort: entity match score
    if (b.entityMatchScore !== a.entityMatchScore) {
      return b.entityMatchScore - a.entityMatchScore;
    }
    // Secondary sort: original baseScore if available
    return (b.baseScore || 0) - (a.baseScore || 0);
  });
}

module.exports = {
  extractEntities,
  getPrimaryEntity,
  generateSearchQueries,
  scoreCandidatesByEntities,
  removeFillerWords,
  normalizeText,
  LOCATION_PATTERNS,
  KNOWN_LANDMARKS,
  FILLER_WORDS
};
