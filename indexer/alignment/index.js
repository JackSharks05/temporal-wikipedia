#!/usr/bin/env node

const {
  normalizeError: normalizeStoreError,
} = require("../../lib/normalizeError");
const { createMetrics } = require("../../lib/indexerMetrics");

function listEmbeddingKeys(store, gid, year, callback) {
  store.get({ key: null, gid }, (err, keys) => {
    const normalized = normalizeStoreError(err);
    if (normalized) return callback(normalized);

    const prefix = `embedding:${year}:`;
    const out = (Array.isArray(keys) ? keys : []).filter(
      (k) => typeof k === "string" && k.startsWith(prefix),
    );
    callback(null, out);
  });
}

function loadEmbeddingsForYear(store, gid, year, callback) {
  listEmbeddingKeys(store, gid, year, (listErr, keys) => {
    if (listErr) return callback(listErr);
    if (keys.length === 0) return callback(null, new Map());

    const map = new Map();
    let pending = keys.length;
    let failed = false;

    keys.forEach((key) => {
      store.get({ key, gid }, (err, value) => {
        if (failed) return;
        const normalized = normalizeStoreError(err);
        if (normalized) {
          failed = true;
          return callback(normalized);
        }

        if (value && Array.isArray(value.vector)) {
          const word = key.split(":").slice(2).join(":");
          map.set(word, value);
        }

        pending -= 1;
        if (pending === 0) callback(null, map);
      });
    });
  });
}

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] || 0) * (b[i] || 0);
  return sum;
}

// squared euclidean distance between vectors
function l2Squared(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    sum += d * d;
  }
  return sum;
}

// sign flips
function applySigns(vec, signs) {
  const out = new Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = (vec[i] || 0) * (signs[i] || 1);
  return out;
}

// use signs to make a diag matrix (query layer needs matrix form)
// this isn't a full orthogonal procrustes but it's a fast approximation
function makeDiagonalMatrix(signs) {
  const d = signs.length;
  const matrix = new Array(d);
  for (let i = 0; i < d; i++) {
    const row = new Array(d).fill(0);
    row[i] = signs[i];
    matrix[i] = row;
  }
  return matrix;
}

// construct alignment params from two yearly embedding maps
function buildSignAlignment(baseMap, targetMap) {
  const shared = [];
  for (const word of baseMap.keys()) {
    if (targetMap.has(word)) shared.push(word);
  }
  if (shared.length === 0) {
    return { error: new Error("no shared vocabulary between years") };
  }

  const first = baseMap.get(shared[0]);
  const dim = first && Array.isArray(first.vector) ? first.vector.length : 0;
  if (!dim) return { error: new Error("invalid embedding dimensionality") }; // validate dimension using shared word

  const sums = new Array(dim).fill(0);
  for (const word of shared) {
    const a = baseMap.get(word).vector;
    const b = targetMap.get(word).vector;
    if (
      !Array.isArray(a) ||
      !Array.isArray(b) ||
      a.length !== dim ||
      b.length !== dim
    ) {
      continue;
    }
    for (let i = 0; i < dim; i++) sums[i] += (a[i] || 0) * (b[i] || 0);
  }

  const signs = sums.map((s) => (s >= 0 ? 1 : -1));

  let disparity = 0;
  let used = 0;
  for (const word of shared) {
    // intersecting vocabularies
    const a = baseMap.get(word).vector;
    const b = targetMap.get(word).vector;
    if (
      !Array.isArray(a) ||
      !Array.isArray(b) ||
      a.length !== dim ||
      b.length !== dim
    ) {
      continue;
    }
    disparity += l2Squared(a, applySigns(b, signs));
    used += 1;
  }

  return {
    value: {
      dimension: dim,
      sharedVocabSize: used,
      disparity: used > 0 ? disparity / used : null,
      signs,
      matrixR: makeDiagonalMatrix(signs),
      method: "diag-sign-procrustes-lite",
    },
  };
}

// stores sign alignment to store
function buildAlignment(gid, baseYear, targetYear, callback) {
  if (typeof callback !== "function") callback = () => {};

  const service = globalThis.distribution && globalThis.distribution[gid];
  if (!service || !service.store) {
    return callback(new Error(`group not found: ${gid}`));
  }

  const store = service.store;
  const metrics = createMetrics("alignment");

  const endLoad = metrics.phase("load");
  loadEmbeddingsForYear(store, gid, baseYear, (baseErr, baseMap) => {
    if (baseErr) {
      endLoad();
      return callback(baseErr);
    }
    loadEmbeddingsForYear(store, gid, targetYear, (targetErr, targetMap) => {
      endLoad();
      if (targetErr) return callback(targetErr);

      const endAlign = metrics.phase("align");
      const built = buildSignAlignment(baseMap, targetMap);
      endAlign();
      if (built.error) return callback(built.error);

      const payload = {
        baseYear: Number(baseYear),
        targetYear: Number(targetYear),
        ...built.value,
      };

      const endWrite = metrics.phase("write");
      store.put(
        payload,
        { gid, key: `align:${baseYear}:${targetYear}` },
        (putErr) => {
          endWrite();
          const normalized = normalizeStoreError(putErr);
          if (normalized) return callback(normalized);

          metrics.report({ shared: payload.sharedVocabSize });
          callback(null, payload);
        },
      );
    });
  });
}

module.exports = { buildAlignment, loadEmbeddingsForYear, applySigns };

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
      "Usage: node indexer/alignment/index.js --base-year <YYYY> --target-year <YYYY> [--gid wiki]",
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

    buildAlignment(gid, baseYear, targetYear, async (err, value) => {
      if (err) {
        console.error("[alignment] Error:", err.message);
        await shutdown(dist);
        process.exit(1);
      }

      console.log(`[alignment] stored align:${baseYear}:${targetYear}`);
      if (value && value.sharedVocabSize != null) {
        console.log(
          `[alignment] shared vocab: ${value.sharedVocabSize}, disparity: ${value.disparity}`,
        );
      }

      await shutdown(dist);
      process.exit(0);
    });
  })();
}
