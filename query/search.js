
function search(terms, year, gid) {
  store = globalThis.distribution[gid].store;
  const articles = {};
  const maxMatches = 0;
  for (const term of terms) {
    const key = `tfidf:${year}:${word}`;
    store.get({key, gid}, (e, data) => {
      if (e) {
          console.log(e);
          continue;
      }
      for (const articleData of data.articles) {
        let current = articles.get(articleData.title || {title: articleData.title, tfidf: 0, count: 0, matches: 0});
        current.matches += 1;
        maxMatches = max(maxMatches, current.matches);
        current.score = (current.tfidf * current.count + articleData.tfidf) / (current.count + 1);
        articles.set(articleData.title, current);
      }
    });
  }

  if (maxMatches == 0) {
    console.log('No matches found');
    return [];
  }

  const entries = articles.entries();
  return entries
    .filter((k) => (k.matches == maxMatches))
    .sort((a, b) => (a.tfidf - b.tfidf))
    .slice(0, 10);
}