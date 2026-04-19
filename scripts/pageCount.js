#!/usr/bin/env node

const {connectToCluster, shutdown, getArg} = require('../lib/clusterConnect');
const {concurrentEach} = require('../lib/concWrite');

const gid = getArg('--gid', 'wiki');
const prefix = 'article-year-history:';

(async () => {
  let dist;
  try {
    dist = await connectToCluster({
      nodesFile: getArg('--nodes-file', null),
      gid,
      port: parseInt(getArg('--port', '8099'), 10),
      ip: getArg('--ip', null),
    });
  } catch (err) {
    console.error('Failed to connect:', err.message);
    process.exit(1);
  }

  console.log(`[pageCount] group: ${gid}`);
  console.log(`[pageCount] listing ${prefix}* keys...`);

  dist[gid].store.get({key: null, gid}, async (err, allKeys) => {
    if (err instanceof Error) {
      console.error('[pageCount] list error:', err.message);
      await shutdown(dist);
      process.exit(1);
    }

    const articleKeys = (allKeys || []).filter((k) =>
        typeof k === 'string' && k.startsWith(prefix));

    console.log(`[pageCount] found ${articleKeys.length} article pages`);

    if (articleKeys.length === 0) {
      await shutdown(dist);
      process.exit(0);
    }

    let totalYears = 0;
    let articlesWithNoYears = 0;
    const yearHistogram = new Map();

    concurrentEach(articleKeys, (key, cb) => {
      dist[gid].store.get({key, gid}, (e, data) => {
        if (!e && data && data.years) {
          const yearCount = Object.keys(data.years)
              .filter((y) => data.years[y])
              .length;
          totalYears += yearCount;
          yearHistogram.set(yearCount, (yearHistogram.get(yearCount) || 0) + 1);
        } else {
          articlesWithNoYears++;
        }
        cb(null);
      });
    }, async (err) => {
      if (err) console.error('[pageCount] warning:', err.message);

      const totalArticles = articleKeys.length;
      const withContent = totalArticles - articlesWithNoYears;
      const avgYears = withContent > 0 ? totalYears / withContent : 0;

      console.log(`\n[pageCount] SUMMARY for gid=${gid}`);
      console.log(`  total article pages:       ${totalArticles}`);
      console.log(`  articles with year data:   ${withContent}`);
      console.log(`  articles with no years:    ${articlesWithNoYears}`);
      console.log(`  total (article, year):     ${totalYears}`);
      console.log(`  avg years per article:     ${avgYears.toFixed(2)}`);

      console.log(`\n[pageCount] year-count histogram:`);
      const sorted = [...yearHistogram.entries()].sort((a, b) => a[0] - b[0]);
      for (const [yc, count] of sorted) {
        console.log(`  ${String(yc).padStart(3)} years → ${count} articles`);
      }

      await shutdown(dist);
      process.exit(0);
    });
  });
})();
