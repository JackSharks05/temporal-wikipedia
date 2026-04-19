function mapper(key, stats, ctx) {
  // expected key shape: "diff:<year>:<word>"
  const parts = key.split(':');
  if (parts.length < 3 || parts[0] !== 'diff') return [];
  const year = parts[1];
  const word = parts.slice(2).join(':');
  return {[year]: {word, ...stats}};
}

module.exports = {mapper};
