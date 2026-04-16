/**
 * temporalDiff reducer — plain Node module, required on each worker
 * by the MR shim in indexer/temporalDiff/index.js at runtime.
 *
 * Signature (called once per shuffle key):
 *   reduceYearWord(key, values) -> { "<year>:<word>": {totalAdded, totalRemoved, articleCount, articlesAdded, articlesRemoved} }
 *
 * Each value in `values` is a per-article tally {article, added, removed}
 * from the mapper. We sum them and count how many distinct articles
 * contributed adds vs removes.
 */

function reduceYearWord(key, values) {
  let added = 0;
  let removed = 0;
  let articlesAdded = 0;
  let articlesRemoved = 0;

  const vals = Array.isArray(values) ? values : [values];

  for (const v of vals) {
    if (!v) continue;
    if (v.added > 0) {
      added += v.added;
      articlesAdded++;
    }
    if (v.removed > 0) {
      removed += v.removed;
      articlesRemoved++;
    }
  }

  const result = {};
  result[key] = {
    totalAdded: added,
    totalRemoved: removed,
    articleCount: vals.length,
    articlesAdded,
    articlesRemoved,
  };
  return result;
}

module.exports = {reduceYearWord};
