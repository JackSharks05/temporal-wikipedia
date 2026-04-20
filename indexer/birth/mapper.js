function mapper(key, stats, ctx) {
  const parts = key.split(':');
  if (parts.length < 3 || parts[0] !== 'diff') return [];
  const year = parts[1];
  const word = parts.slice(2).join(':');
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
