function reducer(yearWord, entries, ctx) {
  if (entries.length < 2) return null;

  const articleCount = ctx.articleCount;
  const cap = ctx.cap;
  const idf = Math.log(articleCount / entries.length);

  const byTitle = new Map();
  for (const entry of entries) {
    const tf = entry.freq / entry.totalTerms;
    const tfidf = tf * idf;
    const existing = byTitle.get(entry.title);
    if (!existing || tfidf > existing.tfidf) {
      byTitle.set(entry.title, {title: entry.title, tfidf});
    }
  }

  const articles = [...byTitle.values()].sort((a, b) => b.tfidf - a.tfidf);

  return {
    [`tfidf:${yearWord}`]: {
      docCount: byTitle.size,
      idf,
      articles: articles.slice(0, cap),
    },
  };
}

module.exports = {reducer};
