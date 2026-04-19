#!/usr/bin/env node

/**
 * temporalDiff indexer — distributed MapReduce over article-meta keys.
 */

const {normalizeError: normalizeStoreError} = require('../../lib/normalizeError');
const {createMetrics} = require('../../lib/indexerMetrics');
const {concurrentEach} = require('../../lib/concWrite');

const MAPPER_MODULE = require.resolve('./mapper');
const REDUCER_MODULE = require.resolve('./reducer');

function buildDistributedIndex(gid, callback, options) {
  if (typeof callback !== 'function') callback = () => {};
  const topN = (options && options.topN) || 3;

  const service = globalThis.distribution && globalThis.distribution[gid];
  if (!service || !service.store || !service.mr) {
    return callback(new Error(`group not found or missing mr: ${gid}`));
  }

  const metrics = createMetrics('temporalDiff');
  console.log(`[indexer] starting MapReduce (topN=${topN})...`);

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
      metrics.report({results: 0, written: 0});
      return callback(null, 0);
    }

    const entries = [];
    for (const obj of results) {
      if (!obj || typeof obj !== 'object') continue;
      const keys = Object.keys(obj);
      if (keys.length === 0) continue;
      const yw = keys[0];
      entries.push({key: `diff:${yw}`, value: obj[yw]});
    }

    console.log(`[indexer] MapReduce done, writing ${entries.length} entries...`);
    const endWrite = metrics.phase('write');

    concurrentEach(entries, (e, cb) => {
      service.store.put(e.value, {key: e.key, gid}, (putErr) => cb(normalizeStoreError(putErr)));
    }, (err, written) => {
      endWrite();
      if (err) return callback(err);
      console.log(`[indexer] stored ${written} diff:year:word entries`);
      metrics.report({results: results.length, written});
      return callback(null, written);
    });
  });
}

module.exports = {buildDistributedIndex};

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
