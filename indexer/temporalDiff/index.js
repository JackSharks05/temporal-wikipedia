#!/usr/bin/env node

/**
 * temporalDiff indexer — distributed MapReduce over article-meta keys.
 */

const {normalizeError: normalizeStoreError} = require('../../lib/normalizeError');

const MAPPER_MODULE = require.resolve('./mapper');
const REDUCER_MODULE = require.resolve('./reducer');

/**
 * List all article-meta keys in the store (one per article).
 */
function listArticleKeys(gid, callback) {
  const service = globalThis.distribution && globalThis.distribution[gid];
  if (!service || !service.store) {
    return callback(new Error(`group not found: ${gid}`));
  }

  service.store.get({key: null, gid}, (err, allKeys) => {
    if (err instanceof Error) return callback(err);

    const prefix = 'article-meta:';
    const articleKeys = (allKeys || [])
        .filter((k) => typeof k === 'string' && k.startsWith(prefix));

    callback(null, articleKeys);
  });
}

function buildDistributedIndex(gid, callback, options) {
  if (typeof callback !== 'function') callback = () => {};
  const topN = (options && options.topN) || 10;

  const service = globalThis.distribution && globalThis.distribution[gid];
  if (!service || !service.store || !service.mr) {
    return callback(new Error(`group not found or missing mr: ${gid}`));
  }

  console.log('[indexer] listing article keys...');

  listArticleKeys(gid, (listErr, articleKeys) => {
    if (listErr) return callback(listErr);
    if (!articleKeys || articleKeys.length === 0) {
      return callback(new Error('no articles found in store'));
    }

    console.log(`[indexer] found ${articleKeys.length} articles, starting MapReduce (topN=${topN})...`);

    service.mr.exec({
      keyPrefix: 'article-meta:',
      mapModule: MAPPER_MODULE,
      mapExport: 'mapArticle',
      mapContext: {gid},
      reduceModule: REDUCER_MODULE,
      reduceExport: 'reduceYearWord',
      reduceContext: {topN},
    }, (mrErr, results) => {
      if (mrErr) return callback(normalizeStoreError(mrErr));

      if (!results || results.length === 0) {
        console.log('[indexer] MapReduce produced no results');
        return callback(null, 0);
      }

      console.log(`[indexer] MapReduce done, writing ${results.length} index entries...`);

      let i = 0;
      let written = 0;

      function nextWrite() {
        if (i >= results.length) {
          console.log(`[indexer] stored ${written} diff:year:word entries`);
          return callback(null, written);
        }

        const obj = results[i++];
        if (!obj || typeof obj !== 'object') return nextWrite();

        const keys = Object.keys(obj);
        if (keys.length === 0) return nextWrite();

        const yw = keys[0];
        const value = obj[yw];

        service.store.put(value, {key: `diff:${yw}`, gid}, (putErr) => {
          const normalized = normalizeStoreError(putErr);
          if (normalized) return callback(normalized);
          written++;
          if (written % 500 === 0) console.log(`[indexer]   wrote ${written}...`);
          nextWrite();
        });
      }
      nextWrite();
    });
  });
}

module.exports = {
  buildDistributedIndex,
};

if (require.main === module) {
  const {connectToCluster, shutdown, getArg} = require('../../lib/clusterConnect');

  const gid = getArg('--gid', 'wiki');
  const topN = parseInt(getArg('--top-n', '10'), 10);

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
    console.log(`[indexer] done. ${count} year:word index entries built.`);
    await shutdown(dist);
    process.exit(0);
    }, {topN});
  })();
}
