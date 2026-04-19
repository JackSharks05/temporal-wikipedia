function reducer(yearWord, entries, ctx) {
  const articleCount = ctx.articleCount;
  const idf = Math.log(articleCount / entries.length);

  const articles = entries.map((entry) => {
    const tf = entry.freq / entry.totalTerms;
    return {
      title: entry.title,
      freq: entry.freq,
      tfidf: tf * idf,
    };
  });

  return {
    [`tfidf:${yearWord}`]: {
      docCount: entries.length,
      idf,
      articles: articles.sort((a, b) => b.tfidf - a.tfidf),
    },
  };
}

module.exports = {reducer};
