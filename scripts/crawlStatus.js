#!/usr/bin/env node

const {connectToCluster, shutdown, getArg} = require('../lib/clusterConnect');

const PAGE_PREFIX = 'page:';
const crawlGid = 'crawl';

function call(fn) {
  return new Promise((resolve, reject) => {
    fn((err, val) => {
      if (err instanceof Error) return reject(err);
      resolve(val);
    });
  });
}

(async () => {
  const nodesFile = getArg('--nodes-file', null);
  if (!nodesFile) {
    console.error('Usage: node scripts/crawlStatus.js --nodes-file nodes.txt');
    process.exit(1);
  }

  let dist;
  try {
    dist = await connectToCluster({nodesFile, gid: crawlGid, port: 7998});
  } catch (err) {
    console.error('Failed to connect:', err.message);
    process.exit(1);
  }

  try {
    const store = dist[crawlGid].store;
    const keys = await call((cb) => store.get({key: null}, cb));

    const pageKeys = (keys || []).filter((k) => typeof k === 'string' && k.startsWith(PAGE_PREFIX));
    const counts = {total: 0, stored: 0, pending: 0, inflight: 0, failed: 0};
    const storedTitles = [];
    const failedTitles = [];

    for (const key of pageKeys) {
      let val;
      try {
        val = await call((cb) => store.get({key}, cb));
      } catch (e) {
        continue;
      }
      if (!val) continue;
      counts.total++;
      const s = val.status;
      if (counts[s] !== undefined) counts[s]++;

      if (s === 'stored') storedTitles.push(val.title);
      if (s === 'failed') failedTitles.push({title: val.title, err: val.lastError});
    }

    console.log('\n=== Crawl Status ===');
    console.log('Total articles tracked:', counts.total);
    console.log('  Stored (complete):', counts.stored);
    console.log('  Pending:', counts.pending);
    console.log('  In-flight:', counts.inflight);
    console.log('  Failed:', counts.failed);
    console.log('');

    if (storedTitles.length > 0) {
      console.log('Stored articles (' + storedTitles.length + '):');
      storedTitles.sort();
      for (const t of storedTitles) console.log('  ' + t);
    }

    if (failedTitles.length > 0) {
      console.log('\nFailed articles (' + failedTitles.length + '):');
      for (const f of failedTitles) console.log('  ' + f.title + ' -- ' + (f.err || 'unknown'));
    }
  } catch (err) {
    console.error('Error reading crawl state:', err.message || err);
  }

  await shutdown(dist);
  process.exit(0);
})();
