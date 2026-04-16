#!/usr/bin/env node

/**
 * temporalDiff indexer — distributed MapReduce over article-meta keys.
 *
 * Map:    one call per article; loads that article's segments locally,
 *         streams revisions with a year-boundary sliding window, and
 *         emits per-year per-word {added, removed} tallies. Implementation
 *         lives in ./mapper.js and is required on each worker at runtime.
 * Reduce: aggregates year:word tallies across all articles. Implementation
 *         in ./reducer.js.
 * Post:   writes diff:<year>:<word> entries to the store.
 */

function normalizeStoreError(error) {
  if (!error) return null;
  if (error instanceof Error) return error;
  if (typeof error === 'object') {
    const values = Object.values(error).filter(Boolean);
    if (values.length === 0) return null;
    const first = values[0];
    return first instanceof Error ? first : new Error(String(first));
  }
  return new Error(String(error));
}

/**
 * MR map shim — a tiny function that delegates to ./mapper.js on each worker.
 *
 * Functions built with `new Function(...)` run in the GLOBAL scope on the
 * worker, which means Node's module-local `require` is NOT available. To
 * load modules, we use `globalThis.__workerRequire` — a bound copy of the
 * worker process's `require` exposed by scripts/startWorker.js. We also
 * inline `gid` as a string literal because closures are lost across
 * util.serialize's String(fn) round-trip.
 */
function makeIndexMapper(gid) {
  const gidLit = JSON.stringify(gid);
  return new Function('key', 'value', `
    try {
      var req = globalThis.__workerRequire;
      if (typeof req !== 'function') {
        throw new Error('worker missing globalThis.__workerRequire; restart worker with latest startWorker.js');
      }
      var p = req('path');
      var impl = req(p.join(process.cwd(), 'indexer', 'temporalDiff', 'mapper.js'));
      return impl.mapArticle(${gidLit}, key, value);
    } catch (err) {
      console.log('[indexer:shim] map error for key=' + key + ': ' + (err && err.message));
      return [];
    }
  `);
}

/**
 * MR reduce shim — delegates to ./reducer.js on each worker.
 */
function makeIndexReducer() {
  return new Function('key', 'values', `
    try {
      var req = globalThis.__workerRequire;
      if (typeof req !== 'function') {
        throw new Error('worker missing globalThis.__workerRequire; restart worker with latest startWorker.js');
      }
      var p = req('path');
      var impl = req(p.join(process.cwd(), 'indexer', 'temporalDiff', 'reducer.js'));
      return impl.reduceYearWord(key, values);
    } catch (err) {
      console.log('[indexer:shim] reduce error for key=' + key + ': ' + (err && err.message));
      return null;
    }
  `);
}

/**
 * Ping every node in the group to detect dead workers before kicking off MR.
 * Prevents the job from hanging forever on missing notify callbacks.
 */
function healthCheck(gid, callback) {
  const dist = globalThis.distribution;
  if (!dist || !dist.local || !dist.local.groups || !dist.local.comm) {
    return callback(new Error('healthCheck: distribution not available'));
  }

  dist.local.groups.get(gid, (err, group) => {
    if (err) return callback(err);
    const nodes = Object.values(group || {});
    if (!nodes.length) {
      return callback(new Error(`healthCheck: group "${gid}" is empty`));
    }

    console.log(`[indexer] health-checking ${nodes.length} nodes...`);

    let pending = nodes.length;
    const dead = [];

    for (const node of nodes) {
      dist.local.comm.send(
          ['all'],
          {node, service: 'groups', method: 'get'},
          (sendErr) => {
            if (sendErr) dead.push(`${node.ip}:${node.port}`);
            pending--;
            if (pending === 0) {
              if (dead.length > 0) {
                return callback(new Error(
                    `${dead.length}/${nodes.length} workers unreachable: ${dead.join(', ')}\n` +
                    `Restart them with: bash scripts/startAllWorkers.sh`,
                ));
              }
              console.log(`[indexer] all ${nodes.length} nodes reachable`);
              callback(null);
            }
          },
      );
    }
  });
}

/**
 * List all article-meta keys in the store (one per article).
 */
function listArticleKeys(gid, callback) {
  const service = globalThis.distribution && globalThis.distribution[gid];
  if (!service || !service.store) {
    return callback(new Error(`group not found: ${gid}`));
  }

  service.store.get({key: null, gid}, (err, allKeys) => {
    if (err instanceof Error) return callback(err);

    const prefix = 'article-meta:';
    const articleKeys = (allKeys || [])
        .filter((k) => typeof k === 'string' && k.startsWith(prefix));

    callback(null, articleKeys);
  });
}

function buildDistributedIndex(gid, callback) {
  if (typeof callback !== 'function') callback = () => {};

  const service = globalThis.distribution && globalThis.distribution[gid];
  if (!service || !service.store || !service.mr) {
    return callback(new Error(`group not found or missing mr: ${gid}`));
  }

  console.log('[indexer] listing article keys...');

  listArticleKeys(gid, (listErr, articleKeys) => {
    if (listErr) return callback(listErr);
    if (!articleKeys || articleKeys.length === 0) {
      return callback(new Error('no articles found in store'));
    }

    console.log(`[indexer] found ${articleKeys.length} articles, starting MapReduce...`);

    service.mr.exec({
      keyPrefix: 'article-meta:',
      map: makeIndexMapper(gid),
      reduce: makeIndexReducer(),
    }, (mrErr, results) => {
      if (mrErr) return callback(normalizeStoreError(mrErr));

      if (!results || results.length === 0) {
        console.log('[indexer] MapReduce produced no results');
        return callback(null, 0);
      }

      console.log(`[indexer] MapReduce done, writing ${results.length} index entries...`);

      let i = 0;
      let written = 0;

      function nextWrite() {
        if (i >= results.length) {
          console.log(`[indexer] stored ${written} diff:year:word entries`);
          return callback(null, written);
        }

        const obj = results[i++];
        if (!obj || typeof obj !== 'object') return nextWrite();

        const keys = Object.keys(obj);
        if (keys.length === 0) return nextWrite();

        const yw = keys[0];
        const value = obj[yw];

        service.store.put(value, {key: `diff:${yw}`, gid}, (putErr) => {
          const normalized = normalizeStoreError(putErr);
          if (normalized) return callback(normalized);
          written++;
          if (written % 500 === 0) console.log(`[indexer]   wrote ${written}...`);
          nextWrite();
        });
      }
      nextWrite();
    });
  });
}

module.exports = {
  buildDistributedIndex,
  healthCheck,
};

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

    healthCheck(gid, async (healthErr) => {
      if (healthErr) {
        console.error('[indexer] pre-flight failed:', healthErr.message);
        await shutdown(dist);
        process.exit(1);
      }

      buildDistributedIndex(gid, async (err, count) => {
        if (err) {
          console.error('[indexer] Error:', err.message);
          await shutdown(dist);
          process.exit(1);
        }
        console.log(`[indexer] done. ${count} year:word index entries built.`);
        await shutdown(dist);
        process.exit(0);
      });
    });
  })();
}
