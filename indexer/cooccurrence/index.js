#!/usr/bin/env node

/**
 * cooccurrence indexer — distributed MapReduce over article-year snapshots.
 */

const {
  normalizeError: normalizeStoreError,
} = require("../../lib/normalizeError");
const { createMetrics } = require("../../lib/indexerMetrics");

const MAPPER_MODULE = require.resolve("./mapper");
const REDUCER_MODULE = require.resolve("./reducer");

function buildDistributedIndex(gid, callback, options) {
  if (typeof callback !== "function") callback = () => {};
  const topN = (options && options.topN) || 3;

  const service = globalThis.distribution && globalThis.distribution[gid];
  if (!service || !service.store || !service.mr) {
    return callback(new Error(`group not found or missing mr: ${gid}`));
  }

  const metrics = createMetrics("cooccurrence");
  console.log(`[indexer] starting MapReduce (topN=${topN})...`);

  const endMR = metrics.phase("mapreduce");
  service.mr.exec(
    {
      keyPrefix: "article-year-history:",
      mapModule: MAPPER_MODULE,
      mapExport: "mapYearCooccurrence",
      mapContext: { gid },
      reduceModule: REDUCER_MODULE,
      reduceExport: "reduceYearCooccurrence",
      reduceContext: { topN },
      storeResults: true,
    },
    (mrErr, result) => {
      endMR();
      if (mrErr) return callback(normalizeStoreError(mrErr));

      const written = (result && result.written) || 0;
      console.log(
        `[indexer] stored ${written} cooccurrence entries (written during reduce)`,
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
  const topN = parseInt(getArg("--top-n", "10"), 10);

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
        console.log(
          `[indexer] done. ${count} cooccurrence index entries built.`,
        );
        await shutdown(dist);
        process.exit(0);
      },
      { topN },
    );
  })();
}
