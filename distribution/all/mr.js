// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 */

/**
 * Map functions used for mapreduce
 * @callback Mapper
 * @param {string} key
 * @param {any} value
 * @returns {object[] | object}
 */

/**
 * Reduce functions used for mapreduce
 * @callback Reducer
 * @param {string} key
 * @param {any[]} value
 * @returns {object[] | object}
 */

/**
 * @typedef {Object} MRConfig
 * @property {Mapper} map
 * @property {Reducer} reduce
 * @property {string[]} [keys]
 * @property {string} [keyPrefix]
 *
 * @typedef {Object} Mr
 * @property {(configuration: MRConfig, callback: Callback) => void} exec
 */

/**
 * @param {Config} config
 * @returns {Mr}
 */
function mr(config) {
  const context = {
    gid: config.gid || 'all',
  };

  /**
   * @param {MRConfig} configuration
   * @param {Callback} callback
   * @returns {void}
   */
  function exec(configuration, callback) {
    if (typeof callback !== 'function') {
      callback = () => {};
    }

    const dist = globalThis.distribution;
    const id = dist.util.id;

    if (!globalThis.__mr) {
      globalThis.__mr = Object.create(null);
    }

    const name = 'mr-' + id.getID(Date.now() + Math.random()).substring(0, 10);

    dist.local.groups.get(context.gid, (e, group) => {
      if (e) {
        return callback(e, null);
      }

      const expected = Object.keys(group).length;

      globalThis.__mr[name] = {
        gid: context.gid,
        cb: callback,
        expected: expected,
        phase: 'map',
        count: 0,
        results: [],
      };

      const service = {
        setup: function(state, cb) {
          if (typeof cb !== 'function') {
            cb = () => {};
          }

          if (!globalThis.__mr) {
            globalThis.__mr = Object.create(null);
          }

          const old = globalThis.__mr[state.name] || {};
          globalThis.__mr[state.name] = Object.assign(old, state);
          return cb(null, state.name);
        },

        notify: function(name, core, cb) {
          if (typeof cb !== 'function') {
            cb = () => {};
          }

          const job = globalThis.__mr && globalThis.__mr[name];
          if (!job) {
            return cb(new Error('mr.notify: missing job'), null);
          }

          if (core && core.phase === 'reduce' && Array.isArray(core.out)) {
            job.results = job.results.concat(core.out);
          }

          job.count += 1;

          if (job.count < job.expected) {
            console.log('[mr:' + name + '] ' + job.phase + ': ' + job.count + '/' + job.expected + ' workers done');
            return cb(null, core);
          }

          if (job.phase === 'map') {
            console.log('[mr:' + name + '] all ' + job.expected + ' workers finished map, starting shuffle');
            job.phase = 'shuffle';
            job.count = 0;
            globalThis.distribution[job.gid].comm.send([name], {service: name, method: 'shuffle'}, () => {});
            return cb(null, core);
          }

          if (job.phase === 'shuffle') {
            console.log('[mr:' + name + '] all workers finished shuffle, starting reduce');
            job.phase = 'reduce';
            job.count = 0;
            globalThis.distribution[job.gid].comm.send([name], {service: name, method: 'reduce'}, () => {});
            return cb(null, core);
          }

          const done = job.cb;
          const out = job.results.slice();

          console.log('[mr:' + name + '] all workers finished reduce, cleaning up (' + out.length + ' results)');

          globalThis.distribution[job.gid].comm.send(
              [name],
              {service: name, method: 'cleanup'},
              () => {
                globalThis.distribution[job.gid].routes.rem(name, () => {
                  globalThis.distribution.local.routes.rem(name, () => {
                    delete globalThis.__mr[name];
                    return done(null, out);
                  });
                });
              },
          );

          return cb(null, core);
        },

        map: function(name, cb) {
          if (typeof cb !== 'function') {
            cb = () => {};
          }

          const dist = globalThis.distribution;
          const job = globalThis.__mr && globalThis.__mr[name];

          if (!job) {
            return cb(new Error('mr.map: missing job'), null);
          }

          const finish = (count) => {
            console.log('[mr] map done: ' + count + ' keys processed');
            return dist.local.comm.send(
                [name, {phase: 'map'}],
                {node: job.coord, service: name, method: 'notify'},
                () => cb(null, name),
            );
          };

          dist.local.store.get({gid: job.gid, key: null}, (e, localKeys) => {
            if (e || !Array.isArray(localKeys)) localKeys = [];

            let keys;
            if (job.keyPrefix) {
              keys = localKeys.filter((k) => typeof k === 'string' && k.startsWith(job.keyPrefix));
            } else if (job.keys && job.keys.length > 0) {
              const localSet = new Set(localKeys);
              keys = job.keys.filter((k) => localSet.has(k));
            } else {
              keys = localKeys;
            }

            console.log('[mr] map starting: ' + keys.length + ' local keys (of ' + localKeys.length + ' total local)');

            let i = 0;

            const nextKey = () => {
              if (i >= keys.length) {
                return finish(keys.length);
              }

              if (i > 0 && i % 100 === 0) {
                console.log('[mr] map progress: ' + i + '/' + keys.length);
              }

              const key = keys[i];
              i += 1;

              dist.local.store.get({gid: job.gid, key: key}, (e, value) => {
                if (e) {
                  return nextKey();
                }

                let mapped = [];
                try {
                  mapped = job.map(key, value);
                } catch (err) {
                  mapped = [];
                }

                if (!Array.isArray(mapped)) {
                  if (mapped && typeof mapped === 'object') {
                    mapped = [mapped];
                  } else {
                    mapped = [];
                  }
                }

                if (mapped.length === 0) {
                  return nextKey();
                }

                dist.local.store.put(mapped, {gid: job.mapGid, key: key}, () => {
                  return nextKey();
                });
              });
            };
            return nextKey();
          });
        },

        shuffle: function(name, cb) {
          if (typeof cb !== 'function') {
            cb = () => {};
          }

          const dist = globalThis.distribution;
          const job = globalThis.__mr && globalThis.__mr[name];

          if (!job) {
            return cb(new Error('mr.shuffle: missing job'), null);
          }

          const finish = () => {
            console.log('[mr] shuffle done');
            return dist.local.comm.send(
                [name, {phase: 'shuffle'}],
                {node: job.coord, service: name, method: 'notify'},
                () => cb(null, name),
            );
          };

          dist.local.store.get({gid: job.mapGid, key: null}, (e, mapKeys) => {
            if (e || !Array.isArray(mapKeys) || mapKeys.length === 0) {
              console.log('[mr] shuffle: no mapped entries on this worker');
              return finish();
            }

            console.log('[mr] shuffle: ' + mapKeys.length + ' mapped entries to redistribute');

            let i = 0;

            const nextMapped = () => {
              if (i >= mapKeys.length) {
                return finish();
              }

              if (i > 0 && i % 500 === 0) {
                console.log('[mr] shuffle progress: ' + i + '/' + mapKeys.length);
              }

              const mapKey = mapKeys[i];
              i += 1;

              dist.local.store.get({gid: job.mapGid, key: mapKey}, (ge, mapped) => {
                if (ge || !Array.isArray(mapped) || mapped.length === 0) {
                  return nextMapped();
                }

                let j = 0;

                const sendNext = () => {
                  if (j >= mapped.length) {
                    return nextMapped();
                  }

                  const obj = mapped[j];
                  j += 1;

                  if (!obj || typeof obj !== 'object') {
                    return sendNext();
                  }

                  const emitted = Object.keys(obj);
                  let k = 0;

                  const appendOne = () => {
                    if (k >= emitted.length) {
                      return sendNext();
                    }

                    const emitKey = emitted[k];
                    const emitVal = obj[emitKey];
                    k += 1;

                    dist[job.gid].mem.append(emitVal, {gid: job.shuffleGid, key: emitKey}, () => appendOne());
                  };
                  return appendOne();
                };
                return sendNext();
              });
            };
            return nextMapped();
          });
        },

        reduce: function(name, cb) {
          if (typeof cb !== 'function') {
            cb = () => {};
          }

          const dist = globalThis.distribution;
          const job = globalThis.__mr && globalThis.__mr[name];

          if (!job) {
            return cb(new Error('mr.reduce: missing job'), null);
          }

          const out = [];

          const finish = () => {
            console.log('[mr] reduce done: ' + out.length + ' reduced entries emitted');
            return dist.local.comm.send(
                [name, {phase: 'reduce', out: out}],
                {node: job.coord, service: name, method: 'notify'},
                () => cb(null, out),
            );
          };

          dist.local.mem.get({gid: job.shuffleGid, key: null}, (e, reduceKeys) => {
            if (e || !Array.isArray(reduceKeys) || reduceKeys.length === 0) {
              console.log('[mr] reduce: no keys on this worker');
              return finish();
            }

            console.log('[mr] reduce: ' + reduceKeys.length + ' keys to reduce');

            // Synchronous tight loop. dist.local.mem.get invokes its callback
            // on the same tick, so the prior recursive nextReduce pattern grew
            // the V8 stack ~3-4 frames per key and threw RangeError around
            // 2500-3000 iterations, leaving the reduce RPC hung. A plain for
            // loop reads each value via the same-tick callback with zero stack
            // growth and no per-iteration closure allocations.
            for (let i = 0; i < reduceKeys.length; i++) {
              if (i > 0 && i % 500 === 0) {
                console.log('[mr] reduce progress: ' + i + '/' + reduceKeys.length);
              }

              const reduceKey = reduceKeys[i];
              let values = null;
              let getErr = null;
              dist.local.mem.get({gid: job.shuffleGid, key: reduceKey}, (ge, v) => {
                getErr = ge;
                values = v;
              });
              if (getErr) continue;
              if (!Array.isArray(values)) values = [values];

              let reduced = null;
              try {
                reduced = job.reduce(reduceKey, values);
              } catch (err) {
                reduced = null;
              }

              if (Array.isArray(reduced)) {
                for (const x of reduced) out.push(x);
              } else if (reduced && typeof reduced === 'object') {
                out.push(reduced);
              }
            }

            return finish();
          });
        },

        cleanup: function(name, cb) {
          if (typeof cb !== 'function') {
            cb = () => {};
          }

          const job = globalThis.__mr && globalThis.__mr[name];
          if (job && job.mapGid) {
            try {
              // mr service methods are serialized and rebuilt via `new Function`
              // on workers, so they have no module-scope `require`. Use the
              // worker-exposed require (set in scripts/startWorker.js) so we
              // can still load fs/path during cleanup.
              const req = globalThis.__workerRequire || (typeof require === 'function' ? require : null);
              if (!req) throw new Error('worker missing globalThis.__workerRequire');
              const path = req('path');
              const fs = req('fs');
              const nid = globalThis.distribution.util.id.getNID(
                  globalThis.distribution.node.config,
              );
              const storeRoot = path.join(process.cwd(), 'store');
              const mapDir = path.join(storeRoot, nid, job.mapGid);
              if (fs.existsSync(mapDir)) {
                fs.rmSync(mapDir, {recursive: true, force: true});
              }
            } catch (cleanErr) {
              console.log('[mr] cleanup warning: ' + cleanErr.message);
            }
          }

          // Drop the in-memory shuffle partition so intermediate data does
          // not accumulate across MR jobs on a long-running worker.
          if (job && job.shuffleGid) {
            try {
              const mem = globalThis.distribution.local.mem;
              mem.get({gid: job.shuffleGid, key: null}, (ge, keys) => {
                if (ge || !Array.isArray(keys) || keys.length === 0) return;
                for (const k of keys) {
                  mem.del({gid: job.shuffleGid, key: k}, () => {});
                }
              });
            } catch (memErr) {
              console.log('[mr] cleanup mem warning: ' + memErr.message);
            }
          }

          if (globalThis.__mr && globalThis.__mr[name]) {
            delete globalThis.__mr[name];
          }

          return cb(null, name);
        },
      };

      dist.local.routes.put(service, name, (e1) => {
        if (e1) {
          return callback(e1, null);
        }

        dist[context.gid].routes.put(service, name, (e2) => {
          if (e2 instanceof Error) {
            return callback(e2, null);
          }

          let keys = [];
          if (!configuration.keyPrefix && Array.isArray(configuration.keys)) {
            keys = configuration.keys;
          }

          const state = {
            name: name,
            gid: context.gid,
            keys: keys,
            keyPrefix: configuration.keyPrefix || null,
            map: configuration.map,
            reduce: configuration.reduce,
            coord: dist.node.config,
            mapGid: name + '-map',
            shuffleGid: name + '-shuffle',
          };

          dist[context.gid].comm.send(
              [state],
              {service: name, method: 'setup'},
              () => {
                dist[context.gid].comm.send(
                    [name],
                    {service: name, method: 'map'},
                    () => {},
                );
              },
          );
        });
      });
    });
  }

  return {exec};
}

module.exports = mr;
