const RETURN = 10;


function search(terms, year, gid, callback) {
  const store = globalThis.distribution[gid].store;
  const uniqueTerms = [...new Set(terms)];
  const articles = new Map();
  let pending = uniqueTerms.length;

  if (pending === 0) return callback(null, []);

  for (const term of uniqueTerms) {
    const key = `tfidf:${year}:${term}`;
    store.get({key, gid}, (e, data) => {
      if (!e && data && Array.isArray(data.articles)) {
        const seenThisTerm = new Set();
        for (const articleData of data.articles) {
          if (seenThisTerm.has(articleData.title)) continue;
          seenThisTerm.add(articleData.title);

          const current = articles.get(articleData.title) ||
              {title: articleData.title, tfidf: 0, matchedTerms: new Set()};
          current.tfidf += articleData.tfidf;
          current.matchedTerms.add(term);
          articles.set(articleData.title, current);
        }
      }
      pending -= 1;
      if (pending === 0) finish();
    });
  }

  function finish() {
    if (articles.size === 0) return callback(null, []);

    let maxMatches = 0;
    for (const a of articles.values()) {
      if (a.matchedTerms.size > maxMatches) maxMatches = a.matchedTerms.size;
    }

    const best = [...articles.values()]
        .filter((a) => a.matchedTerms.size === maxMatches)
        .sort((a, b) => b.tfidf - a.tfidf)
        .slice(0, RETURN)
        .map((a) => ({title: a.title, tfidf: a.tfidf, matches: a.matchedTerms.size}));

    callback(null, best);
  }
}

module.exports = {search};
