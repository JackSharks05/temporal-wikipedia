#!/usr/bin/env node

const {normalizeError: normalizeStoreError} = require('../../lib/normalizeError');
const {connectToCluster, shutdown, getArg} = require('../../lib/clusterConnect');

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
    storeResults: true,
  }, (mrErr, result) => {
    if (mrErr) return callback(normalizeStoreError(mrErr));
    const written = (result && result.written) || 0;
    return callback(null, written);
  });
}

module.exports = {buildDistributedIndex};

async function main() {
  const gid = getArg('--gid', 'wiki');

  const dist = await connectToCluster({
    nodesFile: getArg('--nodes-file', null),
    gid,
    port: parseInt(getArg('--port', '8081'), 10),
    ip: getArg('--ip', null),
    propagate: true,
  });

  buildDistributedIndex(gid, async (err, count) => {
    if (err) console.error('[indexer] Error:', err.message);
    else console.log(`[indexer] done. ${count} definition entries built.`);
    await shutdown(dist);
    process.exit(err ? 1 : 0);
  });
}

if (require.main === module) main();
