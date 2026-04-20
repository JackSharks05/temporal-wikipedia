#!/usr/bin/env node

const {normalizeError: normalizeStoreError} = require('../../lib/normalizeError');
const {concurrentEach} = require('../../lib/concWrite');

const MAPPER_MODULE = require.resolve('./mapper');
const REDUCER_MODULE = require.resolve('./reducer');

function buildDistributedIndex(gid, callback, options) {
  if (typeof callback !== 'function') callback = () => {};

  const service = globalThis.distribution && globalThis.distribution[gid];
  if (!service || !service.store || !service.mr) {
    return callback(new Error(`group not found or missing mr: ${gid}`));
  }

  console.log('[indexer] starting MapReduce...');

  service.mr.exec({
    keyPrefix: 'article-year-history:',
    mapModule: MAPPER_MODULE,
    mapExport: 'mapArticle',
    mapContext: {gid},
    reduceModule: REDUCER_MODULE,
    reduceExport: 'reduceYearWord',
    reduceContext: {},
  }, (mrErr, results) => {
    if (mrErr) return callback(normalizeStoreError(mrErr));

    if (!results || results.length === 0) {
      console.log('[indexer] MapReduce produced no results');
      return callback(null, 0);
    }

    const entries = [];
    for (const obj of results) {
      if (!obj || typeof obj !== 'object') continue;
      const keys = Object.keys(obj);
      if (keys.length === 0) continue;
      const yearTitle = keys[0];
      entries.push({key: `definition:${yearTitle}`, value: obj[yearTitle]});
    }

    console.log(`[indexer] MapReduce done, writing ${entries.length} entries...`);

    concurrentEach(entries, (e, cb) => {
      service.store.put(e.value, {key: e.key, gid}, (putErr) => cb(normalizeStoreError(putErr)));
    }, (err, written) => {
      if (err) return callback(err);
      console.log(`[indexer] stored ${written} definition entries`);
      return callback(null, written);
    });
  });
}

module.exports = {buildDistributedIndex};

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
