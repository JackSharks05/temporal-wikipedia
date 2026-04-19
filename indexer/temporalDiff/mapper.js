/**
 * temporalDiff mapper — invoked once per article (MR keyPrefix
 * 'article-year-history:'). Input `data` has shape {title, years: {year: wikitext}}
 * — year-end snapshots populated by the crawler. No segment replay needed.
 */

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
  const freq = new Map();
  if (!text) return freq;
  const lower = text.toLowerCase();
  TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = TOKEN_RE.exec(lower)) !== null) {
    const w = m[0];
    if (w.length <= 2 || STOP.has(w)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  return freq;
}

function tallyFromFreqs(oldFreq, newFreq, year, title, agg) {
  for (const [w, o] of oldFreq) {
    const n = newFreq.get(w) || 0;
    if (o === n) continue;
    const yw = year + ':' + w;
    let entry = agg[yw];
    if (!entry) entry = agg[yw] = {article: title, added: 0, removed: 0};
    if (n > o) entry.added += n - o;
    else entry.removed += o - n;
  }
  for (const [w, n] of newFreq) {
    if (oldFreq.has(w)) continue;
    const yw = year + ':' + w;
    let entry = agg[yw];
    if (!entry) entry = agg[yw] = {article: title, added: 0, removed: 0};
    entry.added += n;
  }
}

function mapArticle(key, data, ctx) {
  if (!data || !data.years || typeof data.years !== 'object') {
    console.log(`[indexer] skipping key=${key}: data.years missing`);
    return [];
  }

  const title = data.title || '';
  const years = Object.keys(data.years)
      .map((y) => Number(y))
      .filter((y) => Number.isFinite(y))
      .sort((a, b) => a - b);

  if (years.length < 2) return [];

  const agg = Object.create(null);
  let prevFreq = null;

  for (const y of years) {
    const wikitext = data.years[String(y)];
    if (!wikitext) {
      prevFreq = null;
      continue;
    }
    const currFreq = tokenize(wikitext);
    if (prevFreq) tallyFromFreqs(prevFreq, currFreq, y, title, agg);
    prevFreq = currFreq;
  }

  const out = [];
  for (const yw of Object.keys(agg)) out.push({[yw]: agg[yw]});
  return out;
}

module.exports = {mapArticle, tokenize};
