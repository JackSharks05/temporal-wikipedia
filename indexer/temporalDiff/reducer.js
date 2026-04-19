
const DEFAULT_TOP_N = 10;

function rankBy(vals, field, topN) {
  return vals
      .filter((v) => v && v[field] > 0)
      .slice()
      .sort((a, b) => b[field] - a[field] || a.article.localeCompare(b.article))
      .slice(0, topN)
      .map((v) => ({article: v.article, added: v.added, removed: v.removed}));
}

function reduceYearWord(key, values, ctx) {
  const vals = Array.isArray(values) ? values : [values];
  const topN = (ctx && ctx.topN) || DEFAULT_TOP_N;

  let totalAdded = 0;
  let totalRemoved = 0;
  let articlesAdded = 0;
  let articlesRemoved = 0;

  for (const v of vals) {
    if (!v) continue;
    if (v.added > 0) {
      totalAdded += v.added;
      articlesAdded++;
    }
    if (v.removed > 0) {
      totalRemoved += v.removed;
      articlesRemoved++;
    }
  }

  return {
    [`diff:${key}`]: {
      totalAdded,
      totalRemoved,
      articleCount: vals.length,
      articlesAdded,
      articlesRemoved,
      topAdded: rankBy(vals, 'added', topN),
      topRemoved: rankBy(vals, 'removed', topN),
    },
  };
}

module.exports = {reduceYearWord};
