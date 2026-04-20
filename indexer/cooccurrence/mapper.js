const TOKEN_RE = /[a-z0-9]+/g;

function tokenize(text, minLength) {
  if (!text) return [];
  return (
    text
      .toLowerCase()
      .match(TOKEN_RE)
      ?.filter((w) => w.length >= minLength) || []
  );
}

// For each article-year text, emit cooccurrence counts within a token window.
function mapYearCooccurrence(key, data, ctx) {
  if (!data || !data.years || typeof data.years !== "object") return [];

  const windowSize = Math.max(1, (ctx && ctx.windowSize) || 5);
  const minTokenLength = Math.max(1, (ctx && ctx.minTokenLength) || 3);
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
          neighbors: counts[obj]
        },
      });
    }
  }

  return emitted;
}
module.exports = { mapYearCooccurrence };
