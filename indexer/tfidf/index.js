#!/usr/bin/env node

const {normalizeError: normalizeStoreError} = require('../../lib/normalizeError');
const {createMetrics} = require('../../lib/indexerMetrics');
const {concurrentEach} = require('../../lib/concWrite');

const MAPPER_MODULE = require.resolve('./mapper');
const REDUCER_MODULE = require.resolve('./reducer');

function buildTfIdfIndex(gid, callback, options) {
  if (typeof callback !== 'function') callback = () => {};
  const articleCount = (options && options.articleCount) || 2400;
  const cap = (options && options.cap) || 25;

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
    storeResults: true,
  }, (mrErr, result) => {
    endMR();
    if (mrErr) return callback(normalizeStoreError(mrErr));

    const written = (result && result.written) || 0;
    console.log(`[indexer] stored ${written} tfidf entries (written during reduce)`);
    metrics.report({written});
    return callback(null, written);
  });
}

module.exports = {buildTfIdfIndex};

if (require.main === module) {
  const {connectToCluster, shutdown, getArg} = require('../../lib/clusterConnect');
  const gid = getArg('--gid', 'wiki');
  const articleCount = parseInt(getArg('--article-count', '170'), 10);
  const cap = parseInt(getArg('--cap', '25'), 10);

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
