const RETURN = 10;


function search(terms, year, gid, callback) {
  const store = globalThis.distribution[gid].store;
  const articles = new Map();
  let pending = terms.length;

  if (pending === 0) return callback(null, []);

  for (const term of terms) {
    const key = `tfidf:${year}:${term}`;
    store.get({key, gid}, (e, data) => {
      if (!e && data && Array.isArray(data.articles)) {
        for (const articleData of data.articles) {
          const current = articles.get(articleData.title) ||
              {title: articleData.title, tfidf: 0, matches: 0};
          current.tfidf += articleData.tfidf;
          current.matches += 1;
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
      if (a.matches > maxMatches) maxMatches = a.matches;
    }

    const best = [...articles.values()]
        .filter((a) => a.matches === maxMatches)
        .sort((a, b) => b.tfidf - a.tfidf)
        .slice(0, RETURN);

    callback(null, best);
  }
}

module.exports = {search};
