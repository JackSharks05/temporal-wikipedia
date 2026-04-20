#!/usr/bin/env node

const {
  normalizeError: normalizeStoreError,
} = require("../../lib/normalizeError");
const { createMetrics } = require("../../lib/indexerMetrics");
const { concurrentEach } = require("../../lib/concWrite");
const { loadEmbeddingsForYear, applySigns } = require("../alignment/index");

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] || 0) * (b[i] || 0);
  return sum;
}

function norm(a) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const v = a[i] || 0;
    sum += v * v;
  }
  return Math.sqrt(sum);
}

// semantic shift based on cosine distance
function cosineShift(a, b) {
  if (
    !Array.isArray(a) ||
    !Array.isArray(b) ||
    a.length !== b.length ||
    a.length === 0
  ) {
    return null;
  }
  const na = norm(a);
  const nb = norm(b);
  if (na === 0 || nb === 0) return null;
  return 1 - dot(a, b) / (na * nb);
}

// semantic shift based on euclidean distance (geometric displacement magnitude)
function euclideanShift(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
    return null;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

// change measured in relative rank of shared top features (so a general change)
function computeRankShift(baseTopFeatures, targetTopFeatures) {
  const base = Array.isArray(baseTopFeatures) ? baseTopFeatures : [];
  const target = Array.isArray(targetTopFeatures) ? targetTopFeatures : [];
  if (base.length === 0 || target.length === 0) return null;

  const rankA = new Map();
  const rankB = new Map();
  for (let i = 0; i < base.length; i++) {
    const f = base[i] && base[i].feature;
    if (f != null) rankA.set(String(f), i + 1);
  }
  for (let i = 0; i < target.length; i++) {
    const f = target[i] && target[i].feature;
    if (f != null) rankB.set(String(f), i + 1);
  }

  const shared = [...rankA.keys()].filter((f) => rankB.has(f));
  if (shared.length === 0) return null;

  let total = 0;
  for (const f of shared) total += Math.abs(rankA.get(f) - rankB.get(f));
  return total / shared.length;
}

function loadAlignment(store, gid, baseYear, targetYear, callback) {
  store.get({ gid, key: `align:${baseYear}:${targetYear}` }, (err, value) => {
    const normalized = normalizeStoreError(err);
    if (normalized) return callback(normalized);
    if (!value || !Array.isArray(value.signs)) {
      return callback(
        new Error(`missing or invalid align:${baseYear}:${targetYear}`),
      );
    }
    callback(null, value);
  });
}

function buildDrift(gid, baseYear, targetYear, callback) {
  if (typeof callback !== "function") callback = () => {};

  const service = globalThis.distribution && globalThis.distribution[gid];
  if (!service || !service.store) {
    return callback(new Error(`group not found: ${gid}`));
  }

  const store = service.store;
  const metrics = createMetrics("drift");

  const endLoad = metrics.phase("load");
  loadAlignment(store, gid, baseYear, targetYear, (alignErr, alignValue) => {
    if (alignErr) {
      endLoad();
      return callback(alignErr);
    }

    loadEmbeddingsForYear(store, gid, baseYear, (baseErr, baseMap) => {
      if (baseErr) {
        endLoad();
        return callback(baseErr);
      }

      loadEmbeddingsForYear(store, gid, targetYear, (targetErr, targetMap) => {
        endLoad();
        if (targetErr) return callback(targetErr);

        const sharedWords = [];
        for (const word of baseMap.keys()) {
          if (targetMap.has(word)) sharedWords.push(word);
        }
        if (sharedWords.length === 0) {
          return callback(
            new Error("No shared words available for drift computation"),
          );
        }

        const endCompute = metrics.phase("compute");
        const entries = [];
        for (const word of sharedWords) {
          const baseEntry = baseMap.get(word);
          const targetEntry = targetMap.get(word);
          if (
            !baseEntry ||
            !targetEntry ||
            !Array.isArray(baseEntry.vector) ||
            !Array.isArray(targetEntry.vector)
          ) {
            continue;
          }

          const alignedTargetVector = applySigns(
            targetEntry.vector,
            alignValue.signs,
          );
          const cosine = cosineShift(baseEntry.vector, alignedTargetVector);
          const euclidean = euclideanShift(
            baseEntry.vector,
            alignedTargetVector,
          );
          const rankShift = computeRankShift(
            baseEntry.topFeatures,
            targetEntry.topFeatures,
          );

          entries.push({
            key: `drift:${baseYear}:${targetYear}:${word}`,
            value: {
              word,
              baseYear: Number(baseYear),
              targetYear: Number(targetYear),
              cosineShift: cosine,
              euclideanShift: euclidean,
              rankShift,
            },
          });
        }
        endCompute();

        const endWrite = metrics.phase("write");
        concurrentEach(
          entries,
          (entry, cb) => {
            store.put(entry.value, { gid, key: entry.key }, (putErr) => {
              cb(normalizeStoreError(putErr));
            });
          },
          (writeErr, written) => {
            endWrite();
            if (writeErr) return callback(writeErr);

            metrics.report({ shared: sharedWords.length, written });
            callback(null, { sharedWords: sharedWords.length, written });
          },
        );
      });
    });
  });
}

module.exports = { buildDrift };

if (require.main === module) {
  const {
    connectToCluster,
    shutdown,
    getArg,
  } = require("../../lib/clusterConnect");

  const gid = getArg("--gid", "wiki");
  const baseYear = getArg("--base-year", null);
  const targetYear = getArg("--target-year", null);

  if (!baseYear || !targetYear) {
    console.error(
      "Usage: node indexer/drift/index.js --base-year <YYYY> --target-year <YYYY> [--gid wiki]",
    );
    process.exit(1);
  }

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

    buildDrift(gid, baseYear, targetYear, async (err, summary) => {
      if (err) {
        console.error("[drift] Error:", err.message);
        await shutdown(dist);
        process.exit(1);
      }

      console.log(
        `[drift] wrote ${summary.written} drift entries for ${summary.sharedWords} shared words`,
      );
      await shutdown(dist);
      process.exit(0);
    });
  })();
}
