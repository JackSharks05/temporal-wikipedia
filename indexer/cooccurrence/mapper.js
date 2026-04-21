const { stopwords } = require("natural");

const TOKEN_RE = /[a-z0-9]+/g;


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

function tokenize(text, minLength) {
  if (!text) return [];
  return (
    text
      .toLowerCase()
      .match(TOKEN_RE)
      ?.filter((w) => w.length >= minLength && !STOP.has(w)) || []
  );
}

const MAX_TOKENS_PER_YEAR = 20000;
const MAX_NEIGHBORS_PER_ANCHOR = 30;

// For each article-year text, emit cooccurrence counts within a token window.
function mapYearCooccurrence(key, data, ctx) {
  if (!data || !data.years || typeof data.years !== "object") return [];

  const windowSize = Math.max(1, (ctx && ctx.windowSize) || 5);
  const minTokenLength = Math.max(1, (ctx && ctx.minTokenLength) || 4);
  const emitted = [];

  for (const [year, text] of Object.entries(data.years)) {
    let tokens = tokenize(text, minTokenLength);
    if (tokens.length === 0) continue;
    if (tokens.length > MAX_TOKENS_PER_YEAR) {
      tokens = tokens.slice(0, MAX_TOKENS_PER_YEAR);
    }

    const counts = Object.create(null);

    for (let i = 0; i < tokens.length; i++) {
      const anchor = tokens[i];
      const rightBound = Math.min(tokens.length, i + windowSize + 1);
      for (let j = i + 1; j < rightBound; j++) {
        const neighbor = tokens[j];
        if (anchor === neighbor) continue;
        if (!counts[anchor]) counts[anchor] = Object.create(null);
        counts[anchor][neighbor] = (counts[anchor][neighbor] || 0) + 1;
      }
    }

    for (const [anchor, countsObj] of Object.entries(counts)) {
      const entries = Object.entries(countsObj);
      let neighbors;
      if (entries.length > MAX_NEIGHBORS_PER_ANCHOR) {
        entries.sort((a, b) => b[1] - a[1]);
        entries.length = MAX_NEIGHBORS_PER_ANCHOR;
        neighbors = Object.fromEntries(entries);
      } else {
        neighbors = countsObj;
      }
      emitted.push({
        [`cooc:${year}:${anchor}`]: { neighbors },
      });
    }
  }

  return emitted;
}
module.exports = { mapYearCooccurrence };
