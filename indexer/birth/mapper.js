function mapper(key, stats, ctx) {
  // expected key shape: "diff:<year>:<word>"
  const parts = key.split(':');
  if (parts.length < 3 || parts[0] !== 'diff') return [];
  const year = parts[1];
  const word = parts.slice(2).join(':');

  // Project to only the fields the reducer needs. `stats` from the
  // temporalDiff index includes `topAdded`/`topRemoved` arrays (~1.5 KB each)
  // that would bloat shuffle by ~17x if passed through.
  return {
    [year]: {
      word,
      totalAdded: stats && stats.totalAdded || 0,
      totalRemoved: stats && stats.totalRemoved || 0,
      articlesAdded: stats && stats.articlesAdded || 0,
      articlesRemoved: stats && stats.articlesRemoved || 0,
    },
  };
}

module.exports = {mapper};
