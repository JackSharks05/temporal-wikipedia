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

// For each article-year text, emit cooccurrence counts within a token window.
function mapYearCooccurrence(key, data, ctx) {
  if (!data || !data.years || typeof data.years !== "object") return [];

  const windowSize = Math.max(1, (ctx && ctx.windowSize) || 5);
  const minTokenLength = Math.max(1, (ctx && ctx.minTokenLength) || 4);
  const emitted = [];

  for (const [year, text] of Object.entries(data.years)) {
    const tokens = tokenize(text, minTokenLength);
    if (tokens.length === 0) continue;

    const counts = Object.create(null);

    for (let i = 0; i < tokens.length; i++) {
      const anchor = tokens[i];
      const rightBound = Math.min(tokens.length, i + windowSize + 1);
      for (let j = i + 1; j < rightBound; j++) {
        const neighbor = tokens[j];
        if (anchor === neighbor) continue;
        if (!counts[anchor]) counts[anchor] = Object.create(null);
        counts[anchor][neighbor] = (counts[anchor][neighbor] || 0) + 1;
        if (!counts[neighbor]) counts[neighbor] = Object.create(null);
        counts[neighbor][anchor] = (counts[neighbor][anchor] || 0) + 1;
      }
    }
    // fix oom issue just emit a single neighbor counts key per distinct word
    for (const [anchor, countsObj] of Object.entries(counts)) {
      emitted.push({
        [`cooc:${year}:${anchor}`]: {
          neighbors: countsObj,
        },
      });
    }
  }

  return emitted;
}
module.exports = { mapYearCooccurrence };
