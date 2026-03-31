// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 * @typedef {import("../util/id.js").NID} NID
 */

const { showHelpOnFail } = require("yargs");

/**
 * Map functions used for mapreduce
 * @callback Mapper
 * @param {string} key
 * @param {any} value
 * @returns {object[]}
 */

/**
 * Reduce functions used for mapreduce
 * @callback Reducer
 * @param {string} key
 * @param {any[]} value
 * @returns {object}
 */

/**
 * @typedef {Object} MRConfig
 * @property {Mapper} map
 * @property {Reducer} reduce
 * @property {string[]} keys
 *
 * @typedef {Object} Mr
 * @property {(configuration: MRConfig, callback: Callback) => void} exec
 */


/*
  Note: The only method explicitly exposed in the `mr` service is `exec`.
  Other methods, such as `map`, `shuffle`, and `reduce`, should be dynamically
  installed on the remote nodes and not necessarily exposed to the user.
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
    const mrID = globalThis.distribution.util.id.getID(`${configuration}${Date.now()}`);
    const mrGid = `mr${mrID}`;

    /*
      MapReduce steps:
      1) Setup: register a service `mr-<id>` on all nodes in the group. The service implements the map, shuffle, and reduce methods.
      2) Map: make each node run map on its local data and store them locally, under a different gid, to be used in the shuffle step.
      3) Shuffle: group values by key using store.append.
      4) Reduce: make each node run reduce on its local grouped values.
      5) Cleanup: remove the `mr-<id>` service and return the final output.

      Note: Comments inside the stencil describe a possible implementation---you should feel free to make low- and mid-level adjustments as needed.
    */


    globalThis.distribution.local.groups.get(context.gid, (e, group) => {
      let notifyCount = 0;
      const phases = ['map', 'shuffle', 'reduce', 'terminate'];
      let phaseIndex = 0;
      const pendingCallbacks = [];
      const allData = [];
      const errors = [];
      const notify = (e, data, call) => {
        notifyCount++;
        pendingCallbacks.push(call);
        if (data) {
          allData.push(...data);
        }

        if (e) {
          errors.push(e);
        }
        if (notifyCount == Object.keys(group).length) {
          notifyCount = 0;
          phaseIndex++;
          for (const cb of pendingCallbacks) {
            cb(null, phases[phaseIndex]);
          }
          pendingCallbacks.length = 0;
          if (phases[phaseIndex] == 'terminate') {
            globalThis.distribution[context.gid].comm.send(
                [mrGid],
                {service: 'routes', method: 'rem'},
                () => callback(errors, allData),
            );
          }
        }
      };
      const notifyRPC = globalThis.distribution.util.wire.createRPC(notify);
      const mrService = {
        mapper: configuration.map,
        reducer: configuration.reduce,
        notify: notifyRPC,
        map: function(mrGid, mrID, callback) {
          globalThis.distribution.util.log('map called', 'info');
          globalThis.distribution.local.store.get({gid: mrGid}, (e, keys) => {
            if (!keys || keys.length === 0) {
              globalThis.distribution.util.log('empty keys in local store', 'info');
              return this.notify(null, null, (e, nextPhase) => {
                if (nextPhase === 'shuffle') this.shuffle(mrGid, mrID, callback);
              });
            }
            let totalPuts = 0;
            let donePuts = 0;
            const allEntries = [];

            let fetched = 0;
            for (const key of keys) {
              globalThis.distribution.local.store.get({key, gid: mrGid}, (e, v) => {
                if (e) {
                  globalThis.distribution.util.log(`error getting key: ${e.message}`, 'info');
                  return callback(e);
                }
                globalThis.distribution.util.log(`got ${key}, ${v}`, 'info');
                const mapped = this.mapper(key, v);
                globalThis.distribution.util.log(`mapped ${mapped}`);
                const items = Array.isArray(mapped) ? mapped : [mapped];
                globalThis.distribution.util.log(`mapped ${items}`);
                for (const obj of items) {
                  for (const [k, val] of Object.entries(obj)) {
                    allEntries.push({k, val});
                    globalThis.distribution.util.log(`mapped entry {${key}, ${val}}`, 'info');
                    totalPuts++;
                  }
                }
                fetched++;
                if (fetched === keys.length) {
                  if (totalPuts === 0) {
                    return this.notify(null, null, (e, nextPhase) => {
                      if (nextPhase === 'shuffle') this.shuffle(mrGid, mrID, callback);
                    });
                  }
                  for (const {k, val} of allEntries) {
                    globalThis.distribution.local.store.append(val, {key: k, gid: `${mrID}_map`}, (e) => {
                      if (e) {
                        globalThis.distribution.util.log(`append error: ${e.message}`, 'info');
                        return callback(e);
                      }
                      donePuts++;
                      if (donePuts === totalPuts) {
                        this.notify(null, null, (e, nextPhase) => {
                          if (nextPhase === 'shuffle') return this.shuffle(mrGid, mrID, callback);
                        });
                      }
                    });
                  }
                }
              });
            }
          });
        },
        shuffle: function(
            /** @type {string} */ gid,
            /** @type {string} */ mrID,
            /** @type {Callback} */ callback,
        ) {
          // Fetch the mapped values from the local store
          // Shuffle groups values by key (via store.append).
          globalThis.distribution.util.log('shuffle called', 'info');
          globalThis.distribution.local.store.get({gid: `${mrID}_map`}, (e, mappedKeys) => {
            if (e) {
              globalThis.distribution.util.log(`Erorr : getting local store keys after map ${e.message}`, 'info');
              return callback(e);
            }
            globalThis.distribution.util.log(`shuffle keys: ${JSON.stringify(mappedKeys)}, error: ${e}`, 'info');
            if (mappedKeys.length == 0) {
              this.notify(null, null, (e, nextPhase) => {
                globalThis.distribution.util.log('shuffle notify', 'info');
                if (nextPhase == 'reduce') return this.reduce(gid, mrID, callback);
              });
            }
            let seen = 0;
            const shuffleGid = `${mrID}_shuffle`;
            mappedKeys.forEach((key) => {
              globalThis.distribution.local.store.get({key, gid: `${mrID}_map`}, (e, vals) => {
                globalThis.distribution.util.log(`shuffle: got vals for ${key}: ${JSON.stringify(vals)}, err: ${e}`, 'info');
                if (e) {
                  globalThis.distribution.util.log(`error fetching key: ${e.message}`);
                  return callback(e);
                }
                let appended = 0;
                for (const v of vals) {
                  globalThis.distribution.util.log(`appending val`, 'info');
                  globalThis.distribution[gid].store.append(v, {gid: shuffleGid, key: key}, (e, v) => {
                    if (e) {
                      globalThis.distribution.util.log(`error appending ${e.message}`, 'info');
                      return callback(e);
                    }
                    appended++;
                    globalThis.distribution.util.log(`appended`);
                    if (appended === vals.length) {
                      globalThis.distribution.util.log(`seen++`);
                      seen++;
                      if (seen === mappedKeys.length) {
                        this.notify(null, null, (e, nextPhase) => {
                          globalThis.distribution.util.log('shuffle notify', 'info');
                          if (nextPhase === 'reduce') this.reduce(gid, mrID, callback);
                        });
                      }
                    }
                  });
                }
              });
            });
          });
        },
        reduce: function(
            /** @type {string} */ gid,
            /** @type {string} */ mrID,
            /** @type {Callback} */ callback,
        ) {
          // Fetch grouped values from local store, apply reducer, and return final output.
          globalThis.distribution.util.log('reduce called', 'info');
          globalThis.distribution.local.store.get({gid: `${mrID}_shuffle`}, (e, shuffledKeys) => {
            if (e) {
              return callback(e);
            }
            if (shuffledKeys.length == 0) {
              globalThis.distribution.util.log(`returning`);
              this.notify(null, null, (e, v) => {
                console.log(e, v);
              });
            }
            const out = [];
            let seen = 0;
            shuffledKeys.forEach((key) => {
              globalThis.distribution.local.store.get({key: key, gid: `${mrID}_shuffle`}, (e, values) => {
                if (e) {
                  globalThis.distribution.util.log(`e: ${e.message}`, 'info');
                  this.notify(e, null, (e, v) => {
                    console.log(e, v);
                  });
                }
                globalThis.distribution.util.log(`seen++`, 'info');
                out.push(this.reducer(key, values));
                seen++;
                if (seen == shuffledKeys.length) {
                  for (const [k, v] of Object.entries(out)) {
                    globalThis.distribution.util.log(`k: ${k}, v: ${JSON.stringify(v)}`);
                  };
                  globalThis.distribution.util.log(`returning`);
                  this.notify(null, out, (e, v) => {
                    console.log(e, v);
                  });
                }
              });
            });
          });
        },
      };
      globalThis.distribution[context.gid].comm.send([mrService, mrGid], {service: 'routes', method: 'put'}, (e, v) => {
        if (Object.keys(e).length != 0) {
          console.log(e);
          return callback(e);
        }
        const shuffleGid = `${mrID}_shuffle`;
        const shuffleConfig = {gid: shuffleGid};
        globalThis.distribution.local.groups.get(context.gid, (e, group) => {
          globalThis.distribution[context.gid].comm.send(
              [shuffleConfig, group],
              {service: 'groups', method: 'put'},
              (e, v) => {
                globalThis.distribution[context.gid].comm.send(
                    [context.gid, mrID, (e, v) => {}],
                    {service: mrGid, method: 'map'},
                    (e, v) => {
                      for (const [node, err] of Object.entries(e)) {
                        if (err) console.log(`node ${node}:`, err.message || err, err.stack || '');
                      }
                    },
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
