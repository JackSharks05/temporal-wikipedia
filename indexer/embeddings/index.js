#!/usr/bin/env node

/**
 * embeddings indexer — distributed MapReduce over cooccurrence keys.
 */

const {
  normalizeError: normalizeStoreError,
} = require("../../lib/normalizeError");
const { createMetrics } = require("../../lib/indexerMetrics");

const MAPPER_MODULE = require.resolve("./mapper");
const REDUCER_MODULE = require.resolve("./reducer");

function buildDistributedIndex(gid, callback, options) {
  if (typeof callback !== "function") callback = () => {};
  const dimension = (options && options.dimension) || 64;
  const maxNeighborsPerWord = (options && options.maxNeighborsPerWord) || 80;
  const minCount = (options && options.minCount) || 1;
  const topFeaturesCount = (options && options.topFeaturesCount) || 12;

  const service = globalThis.distribution && globalThis.distribution[gid];
  if (!service || !service.store || !service.mr) {
    return callback(new Error(`group not found or missing mr: ${gid}`));
  }

  const metrics = createMetrics("embeddings");
  console.log(
    `[indexer] starting MapReduce (dimension=${dimension}, maxNeighbors=${maxNeighborsPerWord})...`,
  );

  const endMR = metrics.phase("mapreduce");
  service.mr.exec(
    {
      keyPrefix: "cooc:",
      mapModule: MAPPER_MODULE,
      mapExport: "mapCooccurrenceForEmbedding",
      mapContext: { gid, maxNeighborsPerWord, minCount },
      reduceModule: REDUCER_MODULE,
      reduceExport: "reduceYearWordEmbedding",
      reduceContext: { dimension, topFeaturesCount },
      storeResults: true,
    },
    (mrErr, result) => {
      endMR();
      if (mrErr) return callback(normalizeStoreError(mrErr));

      const written = (result && result.written) || 0;
      console.log(
        `[indexer] stored ${written} embedding entries (written during reduce)`,
      );
      metrics.report({ written });
      return callback(null, written);
    },
  );
}

module.exports = { buildDistributedIndex };

if (require.main === module) {
  const {
    connectToCluster,
    shutdown,
    getArg,
  } = require("../../lib/clusterConnect");

  const gid = getArg("--gid", "wiki");
  const dimension = parseInt(getArg("--dimension", "64"), 10);
  const maxNeighborsPerWord = parseInt(getArg("--max-neighbors", "80"), 10);
  const minCount = parseInt(getArg("--min-count", "1"), 10);
  const topFeaturesCount = parseInt(getArg("--top-features", "12"), 10);

  (async () => {
    let dist;
    try {
      dist = await connectToCluster({
        nodesFile: getArg("--nodes-file", null),
        gid,
        port: parseInt(getArg("--port", "8081"), 10),
        ip: getArg("--ip", null),
        propagate: true,
      });
    } catch (err) {
      console.error("Failed to connect:", err.message);
      process.exit(1);
    }

    console.log(`[indexer] group: ${gid}`);

    buildDistributedIndex(
      gid,
      async (err, count) => {
        if (err) {
          console.error("[indexer] Error:", err.message);
          await shutdown(dist);
          process.exit(1);
        }
        console.log(`[indexer] done. ${count} embedding index entries built.`);
        await shutdown(dist);
        process.exit(0);
      },
      { dimension, maxNeighborsPerWord, minCount, topFeaturesCount },
    );
  })();
}
