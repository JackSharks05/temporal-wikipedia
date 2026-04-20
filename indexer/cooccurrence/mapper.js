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

        const forward = `${anchor}\u0000${neighbor}`; // using null character \u0000 as a delimiter
        const backward = `${neighbor}\u0000${anchor}`; // bc it's unlikely to appear in normal text tokens lol
        counts[forward] = (counts[forward] || 0) + 1;
        counts[backward] = (counts[backward] || 0) + 1;
      }
    }

    for (const [pair, count] of Object.entries(counts)) {
      const [word, neighbor] = pair.split("\u0000");
      emitted.push({
        [`cooc:${year}:${word}`]: {
          neighbor,
          count,
        },
      });
    }
  }

  return emitted;
}
module.exports = { mapYearCooccurrence };
