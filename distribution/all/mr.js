// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 * @typedef {import("../util/id.js").NID} NID
 */

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
    callback = callback || function() {};
    const {map: mapFn, reduce: reduceFn, keys} = configuration;


    //const mrID = globalThis.distribution.uitl.id.getID(`${configuration}${Date.now()}`);
    const mrID = globalThis.distribution.util.id.getID(`${Date.now()}${Math.random()}`);
    const mrGid = `mr-${mrID}`;

    globalThis.distribution.local.groups.get(context.gid, (err, group) => {
      if (err) {
        return callback(err);
      }
      const nodes = Object.values(group);
      const nodeCount = nodes.length;

      if (nodeCount === 0) {
        return callback(new Error('No nodes in group'));
      }

      const mapFnStr = globalThis.distribution.util.serialize(mapFn);
      const reduceFnStr = globalThis.distribution.util.serialize(reduceFn);

      const mrService = {
        mapper: mapFnStr,
        reducer: reduceFnStr,

        map: function(data, cb) {
          const {keys: allKeys, gid} = data;
          const mapFunc = globalThis.distribution.util.deserialize(this.mapper);
          const results = [];
          let pending = allKeys.length;

          if (pending === 0) {
            return cb(null, results);
          }

          allKeys.forEach((key) => {
            globalThis.distribution.local.store.get({key, gid}, (e, value) => {
              if (!e && value !== undefined) {
                try {
                  const r = mapFunc(key, value);
                  if (Array.isArray(r)) {
                    results.push(...r);
                  } else if (r) {
                    results.push(r);
                  }
                } catch (err) {

                }
              }
              if (--pending === 0) {
                cb(null, results);
              }
            });
          });
        },

        shuffle: function(data, cb) {
          cb(null, []);
        },

        reduce: function(data, cb) {
          const {mrGid} = data;
          const reduceFunc = globalThis.distribution.util.deserialize(this.reducer);

          globalThis.distribution.local.store.get({key: null, gid: mrGid}, (e, localKeys) => {
            if (e || !localKeys || localKeys.length === 0) {
              return cb(null, []);
            }

            const results = [];
            let pending = localKeys.length;

            localKeys.forEach((key) => {
              globalThis.distribution.local.store.get({key, gid: mrGid}, (e, values) => {
                if (!e && values !== undefined) {
                  try {
                    const arr = Array.isArray(values) ? values : [values];
                    const r = reduceFunc(key, arr);
                    if (r) results.push(r);
                  } catch (err) {
                    // Skip failed reduce
                  }
                }
                if (--pending === 0) {
                  cb(null, results);
                }
              });
            });
          });
        },
      };

      const setupService = (cb) => {
        let done = 0;
        nodes.forEach((node) => {
          const remote = {node, service: 'routes', method: 'put'};
          globalThis.distribution.local.comm.send([mrService, mrGid],remote,() => {
            if (++done === nodeCount) cb();
          });
        });
      };

      // execute map on all nodes
      const executeMap = (cb) => {
        const allResults = [];
        let done = 0;
        nodes.forEach((node) => {
          const remote = {node, service: mrGid, method: 'map'};
          globalThis.distribution.local.comm.send(
            [{keys, gid: context.gid}],
            remote,
            (e,v) => {
              if (!e && Array.isArray(v)) {
                allResults.push(...v);
              }
              if (++done === nodeCount) cb(allResults);
            },
          );
        });
      };

      // shuffle, group values by key using store.append
      const executeShuffle = (mapResults, cb) => {
        if (!mapResults || mapResults.length === 0) {
          return cb();
        }

        const pairs = [];
        mapResults.forEach((result) => {
          Object.keys(result).forEach((key) => {
            pairs.push({key, value: result[key]});
          });
        });

        if (pairs.length === 0) return cb();

        let pending = pairs.length;
        pairs.forEach(({key, value}) => {
          globalThis.distribution[context.gid].store.append(
            value,
            {key, gid: mrGid},
            () => {
              if (--pending === 0) cb();
            },
          );
        });
      };

      // reduce on all nodes
      const executeReduce = (cb) => {
        const allResults = [];
        let done = 0;
        nodes.forEach((node) => {
          const remote = {node, service: mrGid, method: 'reduce'};
          globalThis.distribution.local.comm.send([{mrGid}], remote, (e,v) => {
            if (!e && Array.isArray(v)) {
              allResults.push(...v);
            }
            if (++done === nodeCount) cb(allResults);
          });
        });
      };

      // remove service from all nodes
      const cleanup = (results, cb) => {
        let done = 0;
        nodes.forEach((node) => {
          const remote = {node, service: 'routes', method: 'rem'};
          globalThis.distribution.local.comm.send([mrGid], remote, () => {
            if (++done === nodeCount) cb(results);
          });
        });
      };

      setupService(() => {
        executeMap((mapResults) => {
          executeShuffle(mapResults, () => {
            executeReduce((reduceResults) => {
              cleanup(reduceResults, (results) => {
                callback(null, results);
              });
            });
          });
        });
      });
    });
  }



    /*
      MapReduce steps:
      1) Setup: register a service `mr-<id>` on all nodes in the group. The service implements the map, shuffle, and reduce methods.
      2) Map: make each node run map on its local data and store them locally, under a different gid, to be used in the shuffle step.
      3) Shuffle: group values by key using store.append.
      4) Reduce: make each node run reduce on its local grouped values.
      5) Cleanup: remove the `mr-<id>` service and return the final output.

      Note: Comments inside the stencil describe a possible implementation---you should feel free to make low- and mid-level adjustments as needed.
    */
    // const mrService = {
    //   mapper: configuration.map,
    //   reducer: configuration.reduce,
    //   map: function(
    //       /** @type {string} */ mrGid,
    //       /** @type {string} */ mrID,
    //       /** @type {Callback} */ callback,
    //   ) {
    //     // Map should read the node's local keys under the mrGid gid and write to store under gid `${mrID}_map`.
    //     // Expected output: array of objects with a single key per object.
    //     return callback(new Error('mr.map not implemented'));
    //   },
    //   shuffle: function(
    //       /** @type {string} */ gid,
    //       /** @type {string} */ mrID,
    //       /** @type {Callback} */ callback,
    //   ) {
    //     // Fetch the mapped values from the local store
    //     // Shuffle groups values by key (via store.append).
    //     return callback(new Error('mr.shuffle not implemented'));
    //   },
    //   reduce: function(
    //       /** @type {string} */ gid,
    //       /** @type {string} */ mrID,
    //       /** @type {Callback} */ callback,
    //   ) {
    //     // Fetch grouped values from local store, apply reducer, and return final output.
    //     return callback(new Error('mr.reduce not implemented'));
    //   },
    // };


    // Register the mr service on all nodes in the group and execute in sequence: map, shuffle, reduce.
    // return callback(new Error('mr.exec not implemented'));
  // }

  return {exec};
}

module.exports = mr;
