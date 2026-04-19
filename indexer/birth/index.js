#!/usr/bin/env node

const {normalizeError: normalizeStoreError} = require('../../lib/normalizeError');
const {createMetrics} = require('../../lib/indexerMetrics');

const MAPPER_MODULE = require.resolve('./mapper');
const REDUCER_MODULE = require.resolve('./reducer');

function listDiffKeys(gid, callback) {
  const service = globalThis.distribution && globalThis.distribution[gid];
  if (!service || !service.store) {
    return callback(new Error(`group not found: ${gid}`));
  }

  service.store.get({key: null, gid}, (err, allKeys) => {
    if (err instanceof Error) return callback(err);

    const prefix = 'diff:';
    const diffKeys = (allKeys || [])
        .filter((k) => typeof k === 'string' && k.startsWith(prefix));

    callback(null, diffKeys);
  });
}

function buildDistributedIndex(gid, callback, options) {
  if (typeof callback !== 'function') callback = () => {};
  const topN = (options && options.topN) || 10;

  const service = globalThis.distribution && globalThis.distribution[gid];
  if (!service || !service.store || !service.mr) {
    return callback(new Error(`group not found or missing mr: ${gid}`));
  }

  const metrics = createMetrics('birth');
  console.log('[indexer] listing diff keys...');

  const endList = metrics.phase('list');
  listDiffKeys(gid, (listErr, diffKeys) => {
    endList();
    if (listErr) return callback(listErr);
    if (!diffKeys || diffKeys.length === 0) {
      return callback(new Error('no diff:* entries found in store'));
    }

    console.log(`[indexer] found ${diffKeys.length} diff entries, starting MapReduce (topN=${topN})...`);

    const endMR = metrics.phase('mapreduce');
    service.mr.exec({
      keyPrefix: 'diff:',
      mapModule: MAPPER_MODULE,
      mapExport: 'mapper',
      mapContext: {gid},
      reduceModule: REDUCER_MODULE,
      reduceExport: 'reducer',
      reduceContext: {topN},
    }, (mrErr, results) => {
      endMR();
      if (mrErr) return callback(normalizeStoreError(mrErr));

      if (!results || results.length === 0) {
        console.log('[indexer] MapReduce produced no results');
        metrics.report({input: diffKeys.length, results: 0, written: 0});
        return callback(null, 0);
      }

      const entries = [];
      for (const obj of results) {
        if (!obj || typeof obj !== 'object') continue;
        for (const [k, v] of Object.entries(obj)) entries.push([k, v]);
      }

      console.log(`[indexer] MapReduce done, writing ${entries.length} entries (concurrency=64)...`);

      const CONCURRENCY = 64;
      let idx = 0;
      let written = 0;
      let inFlight = 0;
      let done = false;
      const endWrite = metrics.phase('write');

      function pump() {
        while (!done && inFlight < CONCURRENCY && idx < entries.length) {
          const [key, value] = entries[idx++];
          inFlight++;
          service.store.put(value, {key, gid}, (putErr) => {
            if (done) return;
            const normalized = normalizeStoreError(putErr);
            if (normalized) { done = true; return callback(normalized); }
            inFlight--;
            written++;
            if (written % 10000 === 0) console.log(`[indexer]   wrote ${written}/${entries.length}...`);
            if (idx >= entries.length && inFlight === 0) {
              done = true;
              endWrite();
              console.log(`[indexer] stored ${written} birth/death entries`);
              metrics.report({input: diffKeys.length, results: results.length, written});
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
  listDiffKeys,
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
      console.log(`[indexer] done. ${count} birth/death entries built.`);
      await shutdown(dist);
      process.exit(0);
    }, {topN});
  })();
}
