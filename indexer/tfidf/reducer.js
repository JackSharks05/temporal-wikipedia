function reducer(yearWord, entries, ctx) {
  const articleCount = ctx.articleCount;
  const cap = ctx.cap;
  const idf = Math.log(articleCount / entries.length);

  const articles = entries.map((entry) => {
    const tf = entry.freq / entry.totalTerms;
    return {
      title: entry.title,
      freq: entry.freq,
      tfidf: tf * idf,
    };
  });

  articles.sort((a, b) => b.tfidf - a.tfidf);

  return {
    [`tfidf:${yearWord}`]: {
      docCount: entries.length,
      idf,
      articles: articles.slice(0, cap),
    },
  };
}

module.exports = {reducer};
