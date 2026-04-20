#!/usr/bin/env node

const {normalizeError: normalizeStoreError} = require('../../lib/normalizeError');

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
    if (mrErr) return callback(normalizeStoreError(mrErr));

    const written = (result && result.written) || 0;
    console.log(`[indexer] stored ${written} tfidf entries (written during reduce)`);
    return callback(null, written);
  });
}

module.exports = {buildTfIdfIndex};

const {connectToCluster, shutdown, getArg} = require('../../lib/clusterConnect');

async function main() {
  const gid = getArg('--gid', 'wiki');
  const articleCount = parseInt(getArg('--article-count', '2400'), 10);
  const cap = parseInt(getArg('--cap', '25'), 10);

  const dist = await connectToCluster({
    nodesFile: getArg('--nodes-file', null),
    gid,
    port: parseInt(getArg('--port', '8081'), 10),
    ip: getArg('--ip', null),
    propagate: true,
  });

  buildTfIdfIndex(gid, async (err, count) => {
    if (err) console.error('[indexer] Error:', err.message);
    else console.log(`[tfidf indexer] completed ${count} entries`);
    await shutdown(dist);
    process.exit(err ? 1 : 0);
  }, {articleCount, cap});
}

if (require.main === module) main();
