#!/usr/bin/env node

/**
 * temporalDiff indexer — distributed MapReduce over article-meta keys.
 */

const {normalizeError: normalizeStoreError} = require('../../lib/normalizeError');
const {createMetrics} = require('../../lib/indexerMetrics');

const MAPPER_MODULE = require.resolve('./mapper');
const REDUCER_MODULE = require.resolve('./reducer');

function listArticleKeys(gid, callback) {
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
  const topN = (options && options.topN) || 3;

  const service = globalThis.distribution && globalThis.distribution[gid];
  if (!service || !service.store || !service.mr) {
    return callback(new Error(`group not found or missing mr: ${gid}`));
  }

  const metrics = createMetrics('temporalDiff');
  console.log('[indexer] listing article keys...');

  const endList = metrics.phase('list');
  listArticleKeys(gid, (listErr, articleKeys) => {
    endList();
    if (listErr) return callback(listErr);
    if (!articleKeys || articleKeys.length === 0) {
      return callback(new Error('no articles found in store'));
    }

    console.log(`[indexer] found ${articleKeys.length} articles, starting MapReduce (topN=${topN})...`);

    const endMR = metrics.phase('mapreduce');
    service.mr.exec({
      keyPrefix: 'article-year-history:',
      mapModule: MAPPER_MODULE,
      mapExport: 'mapArticle',
      mapContext: {gid},
      reduceModule: REDUCER_MODULE,
      reduceExport: 'reduceYearWord',
      reduceContext: {topN},
    }, (mrErr, results) => {
      endMR();
      if (mrErr) return callback(normalizeStoreError(mrErr));

      if (!results || results.length === 0) {
        console.log('[indexer] MapReduce produced no results');
        metrics.report({input: articleKeys.length, results: 0, written: 0});
        return callback(null, 0);
      }

      console.log(`[indexer] MapReduce done, writing ${results.length} index entries via putBatch...`);

      const states = [];
      const configs = [];
      for (const obj of results) {
        if (!obj || typeof obj !== 'object') continue;
        const keys = Object.keys(obj);
        if (keys.length === 0) continue;
        const yw = keys[0];
        states.push(obj[yw]);
        configs.push({key: `diff:${yw}`, gid});
      }

      const endWrite = metrics.phase('write');
      service.store.putBatch(states, configs, (putErr, res) => {
        endWrite();
        const normalized = normalizeStoreError(putErr);
        if (normalized) return callback(normalized);
        const written = (res && res.written) || 0;
        console.log(`[indexer] stored ${written} diff:year:word entries`);
        metrics.report({input: articleKeys.length, results: results.length, written});
        return callback(null, written);
      });
    });
  });
}

module.exports = {
  buildDistributedIndex,
  listArticleKeys
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
