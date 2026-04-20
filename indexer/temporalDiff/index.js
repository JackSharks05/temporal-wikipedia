#!/usr/bin/env node

const {normalizeError: normalizeStoreError} = require('../../lib/normalizeError');

const MAPPER_MODULE = require.resolve('./mapper');
const REDUCER_MODULE = require.resolve('./reducer');

function buildDistributedIndex(gid, callback, options) {
  if (typeof callback !== 'function') callback = () => {};
  const topN = (options && options.topN) || 3;

  const service = globalThis.distribution && globalThis.distribution[gid];
  if (!service || !service.store || !service.mr) {
    return callback(new Error(`group not found or missing mr: ${gid}`));
  }

  service.mr.exec({
    keyPrefix: 'article-year-history:',
    mapModule: MAPPER_MODULE,
    mapExport: 'mapArticle',
    mapContext: {gid},
    reduceModule: REDUCER_MODULE,
    reduceExport: 'reduceYearWord',
    reduceContext: {topN},
    storeResults: true,
  }, (mrErr, result) => {
    if (mrErr) return callback(normalizeStoreError(mrErr));

    const written = (result && result.written) || 0;
    console.log(`[indexer] stored ${written} diff:year:word entries (written during reduce)`);
    return callback(null, written);
  });
}

module.exports = {buildDistributedIndex};

const {connectToCluster, shutdown, getArg} = require('../../lib/clusterConnect');

async function main() {
  const gid = getArg('--gid', 'wiki');
  const topN = parseInt(getArg('--top-n', '10'), 10);

  const dist = await connectToCluster({
    nodesFile: getArg('--nodes-file', null),
    gid,
    port: parseInt(getArg('--port', '8081'), 10),
    ip: getArg('--ip', null),
    propagate: true,
  });

  buildDistributedIndex(gid, async (err, count) => {
    if (err) console.error('[indexer] Error:', err.message);
    else console.log(`[indexer] done. ${count} diff:year:word entries built.`);
    await shutdown(dist);
    process.exit(err ? 1 : 0);
  }, {topN});
}

if (require.main === module) main();
