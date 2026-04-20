const STOP = new Set([
  'the', 'is', 'a', 'an', 'and', 'or', 'but', 'in', 'on',
  'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as',
  'was', 'were', 'been', 'be', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'it', 'its', 'this', 'that', 'these', 'those', 'not',
  'he', 'she', 'they', 'we', 'you', 'i', 'me', 'my',
  'are', 'am', 'also', 'can', 'may', 'so', 'than', 'then',
  'who', 'which', 'what', 'where', 'when', 'how', 'all',
  'each', 'every', 'both', 'few', 'more', 'most', 'other',
  'some', 'such', 'no', 'nor', 'only', 'own', 'same',
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
  for (const word of tokenize(text)) {
    freq.set(word, (freq.get(word) || 0) + 1);
  }
  return freq;
}

function diffYears(oldFreq, newFreq, year, title, agg) {
  for (const [word, o] of oldFreq) {
    const n = newFreq.get(word) || 0;
    if (o === n) continue;
    const key = `${year}:${word}`;
    if (!agg[key]) agg[key] = {article: title, added: 0, removed: 0};
    if (n > o) agg[key].added += n - o;
    else agg[key].removed += o - n;
  }
  for (const [word, n] of newFreq) {
    if (oldFreq.has(word)) continue;
    const key = `${year}:${word}`;
    if (!agg[key]) agg[key] = {article: title, added: 0, removed: 0};
    agg[key].added += n;
  }
}

function mapArticle(key, data) {
  const title = data.title;
  const years = Object.keys(data.years).map(Number).sort((a, b) => a - b);

  const agg = {};
  let prevFreq = null;

  for (const year of years) {
    const text = data.years[year];
    if (!text) {
      prevFreq = null;
      continue;
    }
    const currFreq = frequency(text);
    if (prevFreq) diffYears(prevFreq, currFreq, year, title, agg);
    prevFreq = currFreq;
  }

  const results = [];
  for (const [yearWord, value] of Object.entries(agg)) {
    results.push({[yearWord]: value});
  }
  return results;
}

module.exports = {mapArticle};
