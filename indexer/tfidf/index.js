#!/usr/bin/env node

const {normalizeError: normalizeStoreError} = require('../../lib/normalizeError');
const {createMetrics} = require('../../lib/indexerMetrics');
const {concurrentEach} = require('../../lib/concWrite');

const MAPPER_MODULE = require.resolve('./mapper');
const REDUCER_MODULE = require.resolve('./reducer');

function buildTfIdfIndex(gid, callback, options) {
  if (typeof callback !== 'function') callback = () => {};
  const articleCount = (options && options.articleCount) || 2400;
  const cap = (options && options.cap) || 100;

  const service = globalThis.distribution && globalThis.distribution[gid];
  if (!service || !service.store || !service.mr) {
    return callback(new Error(`group not found or missing mr: ${gid}`));
  }

  const metrics = createMetrics('tfidf');
  console.log(`[indexer] starting MapReduce (articleCount=${articleCount}, cap=${cap})...`);

  const endMR = metrics.phase('mapreduce');
  service.mr.exec({
    keyPrefix: 'article-year-history:',
    mapModule: MAPPER_MODULE,
    mapExport: 'mapper',
    mapContext: {gid},
    reduceModule: REDUCER_MODULE,
    reduceExport: 'reducer',
    reduceContext: {articleCount, cap},
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
      const k = keys[0];
      entries.push({key: k, value: obj[k]});
    }

    console.log(`[indexer] MapReduce done, writing ${entries.length} entries...`);
    const endWrite = metrics.phase('write');

    concurrentEach(entries, (e, cb) => {
      service.store.put(e.value, {key: e.key, gid}, (putErr) => cb(normalizeStoreError(putErr)));
    }, (err, written) => {
      endWrite();
      if (err) return callback(err);
      console.log(`[indexer] stored ${written} tfidf entries`);
      metrics.report({results: results.length, written});
      return callback(null, written);
    });
  });
}

module.exports = {buildTfIdfIndex};

if (require.main === module) {
  const {connectToCluster, shutdown, getArg} = require('../../lib/clusterConnect');
  const gid = getArg('--gid', 'wiki');
  const articleCount = parseInt(getArg('--article-count', '2400'), 10);
  const cap = parseInt(getArg('--cap', '100'), 10);

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
    buildTfIdfIndex(gid, async (err, count) => {
      if (err) {
        console.error('[indexer] Error:', err.message);
        await shutdown(dist);
        process.exit(1);
      }
      console.log(`[tfidf indexer] completed ${count} entries`);
      await shutdown(dist);
      process.exit(0);
    }, {articleCount, cap});
  })();
}
