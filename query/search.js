const RETURN = 10;

//goes through all of entries and ranks by tfidf and matches
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
        for (const articleData of data.articles) {
          const current = articles.get(articleData.title) ||
              {title: articleData.title, tfidf: 0};
          current.tfidf += articleData.tfidf;
          articles.set(articleData.title, current);
        }
      }
      pending -= 1;
      if (pending === 0) {
        finish();
      }
    });
  }

  function finish() {
    const best = [...articles.values()]
        .sort((a, b) => b.tfidf - a.tfidf)
        .slice(0, RETURN);
    callback(null, best);
  }
}

module.exports = {search};
