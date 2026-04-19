#!/usr/bin/env node

const {normalizeError: normalizeStoreError} = require('../../lib/normalizeError');
const {createMetrics} = require('../../lib/indexerMetrics');

const MAPPER_MODULE = require.resolve('./mapper');
const REDUCER_MODULE = require.resolve('./reducer');

function listYearHistoryKeys(gid, callback) {
  const service = globalThis.distribution && globalThis.distribution[gid];
  if (!service || !service.store) {
    return callback(new Error(`group not found: ${gid}`));
  }

  service.store.get({key: null, gid}, (err, allKeys) => {
    if (err instanceof Error) return callback(err);

    const prefix = 'article-year-history:';
    const articleKeys = (allKeys || [])
        .filter((k) => typeof k === 'string' && k.startsWith(prefix));

    callback(null, articleKeys);
  });
}

function buildDistributedIndex(gid, callback, options) {
  if (typeof callback !== 'function') callback = () => {};

  const service = globalThis.distribution && globalThis.distribution[gid];
  if (!service || !service.store || !service.mr) {
    return callback(new Error(`group not found or missing mr: ${gid}`));
  }

  const metrics = createMetrics('definition');
  console.log('[indexer] listing article-year-history keys...');

  const endList = metrics.phase('list');
  listYearHistoryKeys(gid, (listErr, articleKeys) => {
    endList();
    if (listErr) return callback(listErr);
    if (!articleKeys || articleKeys.length === 0) {
      return callback(new Error('no article-year-history entries found in store'));
    }

    console.log(`[indexer] found ${articleKeys.length} articles, starting MapReduce...`);

    const endMR = metrics.phase('mapreduce');
    service.mr.exec({
      keyPrefix: 'article-year-history:',
      mapModule: MAPPER_MODULE,
      mapExport: 'mapArticle',
      mapContext: {gid},
      reduceModule: REDUCER_MODULE,
      reduceExport: 'reduceYearWord',
      reduceContext: {},
    }, (mrErr, results) => {
      endMR();
      if (mrErr) return callback(normalizeStoreError(mrErr));

      if (!results || results.length === 0) {
        console.log('[indexer] MapReduce produced no results');
        metrics.report({input: articleKeys.length, results: 0, written: 0});
        return callback(null, 0);
      }

      console.log(`[indexer] MapReduce done, writing ${results.length} index entries (concurrency=64)...`);

      const CONCURRENCY = 64;
      let idx = 0;
      let written = 0;
      let inFlight = 0;
      let done = false;
      const endWrite = metrics.phase('write');

      function pump() {
        while (!done && inFlight < CONCURRENCY && idx < results.length) {
          const obj = results[idx++];
          if (!obj || typeof obj !== 'object') continue;
          const keys = Object.keys(obj);
          if (keys.length === 0) continue;
          const yearTitle = keys[0];
          const definition = obj[yearTitle];

          inFlight++;
          service.store.put(definition, {key: `definition:${yearTitle}`, gid}, (putErr) => {
            if (done) return;
            const normalized = normalizeStoreError(putErr);
            if (normalized) { done = true; return callback(normalized); }
            inFlight--;
            written++;
            if (written % 10000 === 0) console.log(`[indexer]   wrote ${written}/${results.length}...`);
            if (idx >= results.length && inFlight === 0) {
              done = true;
              endWrite();
              console.log(`[indexer] stored ${written} definition entries`);
              metrics.report({input: articleKeys.length, results: results.length, written});
              return callback(null, written);
            }
            pump();
          });
        }
      }
      pump();
    });
  });
}

module.exports = {
  buildDistributedIndex,
  listYearHistoryKeys,
};

if (require.main === module) {
  const {connectToCluster, shutdown, getArg} = require('../../lib/clusterConnect');

  const gid = getArg('--gid', 'wiki');

  (async () => {
    let dist;
    try {
      dist = await connectToCluster({
        nodesFile: getArg('--nodes-file', null),
        gid,
        port: parseInt(getArg('--port', '8081'), 10),
        ip: getArg('--ip', null),
        propagate: true,
      });
    } catch (err) {
      console.error('Failed to connect:', err.message);
      process.exit(1);
    }

    console.log(`[indexer] group: ${gid}`);

    buildDistributedIndex(gid, async (err, count) => {
      if (err) {
        console.error('[indexer] Error:', err.message);
        await shutdown(dist);
        process.exit(1);
      }
      console.log(`[indexer] done. ${count} definition entries built.`);
      await shutdown(dist);
      process.exit(0);
    });
  })();
}
