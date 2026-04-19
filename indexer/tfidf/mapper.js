const STOP = new Set([
  'also', 'known', 'used', 'one', 'two', 'three', 'first',
  'new', 'time', 'year', 'years', 'made', 'since', 'many',
  'however', 'although', 'often', 'several', 'much', 'well',
  'within', 'among', 'upon', 'such', 'like', 'including',
  'refer', 'refers', 'reference', 'references', 'see',
  'called', 'name', 'named', 'based', 'part',
  'nbsp', 'ref', 'cite', 'http', 'https', 'www', 'org', 'com',
  'jpg', 'png', 'svg', 'pdf',
  'the', 'is', 'a', 'an', 'and', 'or', 'but', 'in', 'on',
  'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as',
  'was', 'were', 'been', 'be', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'it', 'its', 'this', 'that', 'these', 'those', 'not',
  'he', 'she', 'they', 'we', 'you', 'i', 'me', 'my',
  'are', 'am', 'can', 'may', 'so', 'than', 'then',
  'who', 'which', 'what', 'where', 'when', 'how', 'all',
  'each', 'every', 'both', 'few', 'more', 'most', 'other',
  'some', 'no', 'nor', 'only', 'own', 'same',
  'about', 'up', 'out', 'if', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'because',
  'until', 'while', 'just', 'over', 'under', 'again', 'further',
  'once', 'here', 'there', 'any', 'very', 'too', 'being',
]);

const TOKEN_RE = /[a-z0-9]+/g;

function tokenize(text) {
  if (!text) return [];
  return text
      .toLowerCase()
      .match(TOKEN_RE)
      ?.filter((w) => w.length > 2 && !STOP.has(w)) || [];
}

function frequency(text) {
  const freq = new Map();
  const words = tokenize(text);
  for (const word of words) {
    freq.set(word, (freq.get(word) || 0) + 1);
  }
  return freq;
}

let DEBUG_FIRST = true;

function mapper(key, data) {
  if (DEBUG_FIRST) {
    DEBUG_FIRST = false;
    console.log('[tfidf:mapper] FIRST CALL key=' + key +
        ' dataType=' + typeof data +
        ' hasYears=' + !!(data && data.years) +
        ' yearKeys=' + (data && data.years ? Object.keys(data.years).length : 'n/a') +
        ' title=' + (data && data.title));
  }
  if (!data || !data.years) return [];
  const title = data.title;
  const activeYears = Object.keys(data.years);
  const results = [];
  for (const year of activeYears) {
    const text = data.years[year];
    if (!text) continue;
    const freq = frequency(text);
    for (const [word, count] of freq) {
      results.push({
        [`${year}:${word}`]: {freq: count, title, totalTerms: freq.size},
      });
    }
  }
  return results;
}

module.exports = {mapper};


if (require.main == moduel) {
    print(mapper())
}