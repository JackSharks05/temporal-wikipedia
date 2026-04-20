const DEFAULT_TOP_N = 10;

function reducer(year, stats, ctx) {
  const topN = (ctx && ctx.topN) || DEFAULT_TOP_N;
  const vals = Array.isArray(stats) ? stats : [stats];

  const births = vals
      .filter((v) => v && v.word && v.totalAdded > 0)
      .sort((a, b) => b.totalAdded - a.totalAdded || a.word.localeCompare(b.word))
      .slice(0, topN)
      .map((v) => ({word: v.word, totalAdded: v.totalAdded, articlesAdded: v.articlesAdded}));

  const deaths = vals
      .filter((v) => v && v.word && v.totalRemoved > 0)
      .sort((a, b) => b.totalRemoved - a.totalRemoved || a.word.localeCompare(b.word))
      .slice(0, topN)
      .map((v) => ({word: v.word, totalRemoved: v.totalRemoved, articlesRemoved: v.articlesRemoved}));

  return {
    [`birth:${year}`]: births,
    [`death:${year}`]: deaths,
  };
}

module.exports = {reducer};
