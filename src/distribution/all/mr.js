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
    gid: config.gid || "all",
  };

  /**
   * @param {MRConfig} configuration
   * @param {Callback} callback
   * @returns {void}
   */
  function exec(configuration, callback) {
    const mrID = globalThis.distribution.util.id.getID(
      `${configuration}${Date.now()}`,
    );
    const mrGid = "mr" + mrID;
    const mapGid = mrGid + "_map";
    const shuffleGid = mrGid + "_shuffle";

    /*
      MapReduce steps:
      1) Setup: register a service `mr-<id>` on all nodes in the group. The service implements the map, shuffle, and reduce methods.
      2) Map: make each node run map on its local data and store them locally, under a different gid, to be used in the shuffle step.
      3) Shuffle: group values by key using store.append.
      4) Reduce: make each node run reduce on its local grouped values.
      5) Cleanup: remove the `mr-<id>` service and return the final output.

      Note: Comments inside the stencil describe a possible implementation---you should feel free to make low- and mid-level adjustments as needed.
    */

    const serviceName = "mr" + mrID;
    const notifyName = "mrNotify" + mrID;

    const mrService = {
      mapper: configuration.map,
      reducer: configuration.reduce,
      map: function (
        /** @type {string} */ gid,
        /** @type {string} */ mrID,
        /** @type {Callback} */ callback,
      ) {
        const thisNodeNID = globalThis.distribution.util.id.getNID(
          globalThis.distribution.node.config,
        );
        const nids = this.nodes.map((n) =>
          globalThis.distribution.util.id.getNID(n),
        );
        const keysInNode = this.keys.filter((key) => {
          const kid = globalThis.distribution.util.id.getID(key);
          return (
            globalThis.distribution.util.id.naiveHash(kid, nids) === thisNodeNID
          );
        });

        let oops = false;
        const fail = (err) => {
          // just centralize it lol
          if (oops) return;
          oops = true;
          globalThis.distribution.local.comm.send(
            ["error", thisNodeNID, err],
            {
              node: this.orchestrator,
              service: this.notifyName,
              method: "notify",
            },
            (e, v) => callback(err, null),
          );
        };

        let waiting = keysInNode.length;
        if (waiting === 0) {
          globalThis.distribution.local.comm.send(
            ["map", thisNodeNID, []],
            {
              node: this.orchestrator,
              service: this.notifyName,
              method: "notify",
            },
            (e, v) => {
              if (e) return fail(e);
              callback(null, true);
            },
          );
          return;
        }

        const oneDone = () => {
          waiting -= 1;
          if (waiting === 0) {
            globalThis.distribution.local.comm.send(
              ["map", thisNodeNID, []],
              {
                node: this.orchestrator,
                service: this.notifyName,
                method: "notify",
              },
              (e, v) => {
                if (e) return fail(e);
                if (!oops) callback(null, true);
              },
            );
          }
        };

        keysInNode.forEach((key) => {
          globalThis.distribution.local.store.get({ gid, key }, (e, v) => {
            if (oops) return;
            if (e) {
              oneDone();
              return;
            }

            const mapped = this.mapper(key, v);
            let mappedEntries = [];
            if (Array.isArray(mapped)) {
              mappedEntries = mapped;
            } else if (mapped && typeof mapped === "object") {
              mappedEntries = Object.entries(mapped).map(([k, v]) => ({
                [k]: v,
              }));
            }
            globalThis.distribution.local.store.put(
              mappedEntries,
              { gid: this.mapGid, key },
              (e, v) => {
                if (oops) return;
                if (e) return fail(e);
                oneDone();
              },
            );
          });
        });
      },
      shuffle: function (
        /** @type {string} */ gid,
        /** @type {string} */ mrID,
        /** @type {Callback} */ callback,
      ) {
        const thisNodeNID = globalThis.distribution.util.id.getNID(
          globalThis.distribution.node.config,
        );
        const nids = this.nodes.map((n) =>
          globalThis.distribution.util.id.getNID(n),
        );
        const keysInNode = this.keys.filter((key) => {
          const kid = globalThis.distribution.util.id.getID(key);
          return (
            globalThis.distribution.util.id.naiveHash(kid, nids) === thisNodeNID
          );
        });

        let oops = false;
        const outKeys = new Set();
        let waitingReads = keysInNode.length;
        let waitingAppends = 0;

        const fail = (err) => {
          if (oops) return;
          oops = true;
          globalThis.distribution.local.comm.send(
            ["error", thisNodeNID, err],
            {
              node: this.orchestrator,
              service: this.notifyName,
              method: "notify",
            },
            (e, v) => callback(err, null),
          );
        };

        const maybeFinishHopefullyPlease = () => {
          if (oops) return;
          if (waitingReads === 0 && waitingAppends === 0) {
            // so basically when both are done
            globalThis.distribution.local.comm.send(
              ["shuffle", thisNodeNID, Array.from(outKeys)],
              {
                node: this.orchestrator,
                service: this.notifyName,
                method: "notify",
              },
              (e, v) => {
                if (e) return fail(e);
                callback(null, true);
              },
            );
          }
        };

        if (waitingReads === 0) {
          maybeFinishHopefullyPlease();
          return;
        }

        keysInNode.forEach((key) => {
          globalThis.distribution.local.store.get(
            { gid: this.mapGid, key },
            (e, mappedArray) => {
              if (oops) return;
              if (!e) {
                const entries = Array.isArray(mappedArray) ? mappedArray : [];
                entries.forEach((entry) => {
                  const outKey = Object.keys(entry)[0];
                  if (typeof outKey !== "string") return;
                  const outVal = entry[outKey];

                  outKeys.add(outKey);
                  const outKid = globalThis.distribution.util.id.getID(outKey);
                  const destNID =
                    globalThis.distribution.util.id.consistentHash(
                      outKid,
                      nids,
                    );
                  const destNode = this.nodes.find(
                    (n) =>
                      globalThis.distribution.util.id.getNID(n) === destNID,
                  );
                  if (!destNode) return;

                  waitingAppends += 1;
                  globalThis.distribution.local.comm.send(
                    [outVal, { gid: this.shuffleGid, key: outKey }],
                    { node: destNode, service: "store", method: "append" },
                    (e, v) => {
                      if (oops) return;
                      if (e) return fail(e);
                      waitingAppends -= 1;
                      maybeFinishHopefullyPlease();
                    },
                  );
                });
              }
              waitingReads -= 1;
              maybeFinishHopefullyPlease();
            },
          );
        });
      },
      reduce: function (
        /** @type {string} */ gid,
        /** @type {string} */ mrID,
        /** @type {string[] | Callback} */ maybeReduceKeys,
        /** @type {Callback} */ callback,
      ) {
        /** @type {string[]} */
        let reduceKeys = [];
        /** @type {Callback} */
        let doneCallback = callback;
        if (typeof maybeReduceKeys === "function") {
          doneCallback = maybeReduceKeys;
        } else if (Array.isArray(maybeReduceKeys)) {
          reduceKeys = maybeReduceKeys;
        }

        const thisNodeNID = globalThis.distribution.util.id.getNID(
          globalThis.distribution.node.config,
        );
        const nids = this.nodes.map((n) =>
          globalThis.distribution.util.id.getNID(n),
        );

        let oops = false;
        const found = new Set();
        const results = [];

        const fail = (err) => {
          if (oops) return;
          oops = true;
          globalThis.distribution.local.comm.send(
            ["error", thisNodeNID, err],
            {
              node: this.orchestrator,
              service: this.notifyName,
              method: "notify",
            },
            () => doneCallback(err, null),
          );
        };

        const runReduce = (candidateOutKeys) => {
          const ownedOutKeys = candidateOutKeys.filter((outKey) => {
            const kid = globalThis.distribution.util.id.getID(outKey);
            return (
              globalThis.distribution.util.id.consistentHash(kid, nids) ===
              thisNodeNID
            );
          });

          if (ownedOutKeys.length === 0) {
            globalThis.distribution.local.comm.send(
              ["reduce", thisNodeNID, []],
              {
                node: this.orchestrator,
                service: this.notifyName,
                method: "notify",
              },
              (e, v) => {
                if (e) return fail(e);
                doneCallback(null, []);
              },
            );
            return;
          }

          let waitingReduce = ownedOutKeys.length;
          ownedOutKeys.forEach((outKey) => {
            globalThis.distribution.local.store.get(
              { gid: this.shuffleGid, key: outKey },
              (e, v) => {
                if (oops) return;
                if (!e) {
                  results.push(this.reducer(outKey, v));
                }
                waitingReduce -= 1;
                if (waitingReduce === 0) {
                  globalThis.distribution.local.comm.send(
                    ["reduce", thisNodeNID, results],
                    {
                      node: this.orchestrator,
                      service: this.notifyName,
                      method: "notify",
                    },
                    (e, v) => {
                      if (e) return fail(e);
                      doneCallback(null, results);
                    },
                  );
                }
              },
            );
          });
        };

        if (reduceKeys.length > 0) {
          runReduce(Array.from(new Set(reduceKeys)));
          return;
        }

        let waitingDiscover = this.keys.length;
        if (waitingDiscover === 0) {
          runReduce([]);
          return;
        }

        this.keys.forEach((key) => {
          globalThis.distribution.local.store.get(
            { gid: this.mapGid, key },
            (e, mappedArray) => {
              if (oops) return;
              if (!e) {
                const entries = Array.isArray(mappedArray) ? mappedArray : [];
                entries.forEach((entry) => {
                  const outKey = Object.keys(entry)[0];
                  if (typeof outKey === "string") found.add(outKey);
                });
              }
              waitingDiscover -= 1;
              if (waitingDiscover === 0) {
                runReduce(Array.from(found));
              }
            },
          );
        });
      },
    };

    globalThis.distribution.local.groups.get(context.gid, (e, nodesMap) => {
      if (e) {
        callback(e, null);
        return;
      }

      const nodes = Object.values(nodesMap);
      const orchestratorNode = globalThis.distribution.node.config;
      const mapDone = new Set();
      const shuffleDone = new Set();
      const reduceDone = new Set();
      const reduceOutputs = [];
      const reduceKeys = new Set();

      let finished = false;
      const finish = (err, value) => {
        if (finished) return;
        finished = true;
        callback(err, value);
      };

      const dispatchPhase = (method) => {
        nodes.forEach((node) => {
          globalThis.distribution.local.comm.send(
            [context.gid, mrID],
            { node, service: serviceName, method },
            (e, v) => {
              if (e) finish(e, null);
            },
          );
        });
      };

      const notifyService = {
        notify: function (phase, nodeID, payload) {
          if (finished) return;

          if (phase === "error") {
            finish(payload, null);
            return;
          }

          if (phase === "map") {
            mapDone.add(nodeID);
            if (mapDone.size === nodes.length) {
              dispatchPhase("shuffle");
            }
            return;
          }

          if (phase === "shuffle") {
            shuffleDone.add(nodeID);
            if (Array.isArray(payload)) {
              payload.forEach((k) => reduceKeys.add(k));
            }
            if (shuffleDone.size === nodes.length) {
              const allReduceKeys = Array.from(reduceKeys);
              nodes.forEach((node) => {
                globalThis.distribution.local.comm.send(
                  [context.gid, mrID, allReduceKeys],
                  { node, service: serviceName, method: "reduce" },
                  (e) => {
                    if (e) finish(e, null);
                  },
                );
              });
            }
            return;
          }

          if (phase === "reduce") {
            reduceDone.add(nodeID);
            if (Array.isArray(payload)) {
              reduceOutputs.push(...payload);
            }
            if (reduceDone.size === nodes.length) {
              let waitingCleanup = nodes.length;
              if (waitingCleanup === 0) {
                globalThis.distribution.local.routes.rem(notifyName, () => {
                  finish(null, reduceOutputs);
                });
                return;
              }

              nodes.forEach((node) => {
                globalThis.distribution.local.comm.send(
                  [serviceName],
                  { node, service: "routes", method: "rem" },
                  (e, v) => {
                    if (finished) return;
                    if (e) {
                      finish(e, null);
                      return;
                    }
                    waitingCleanup -= 1;
                    if (waitingCleanup === 0) {
                      globalThis.distribution.local.routes.rem(
                        notifyName,
                        (e, v) => {
                          finish(null, reduceOutputs);
                        },
                      );
                    }
                  },
                );
              });
            }
          }
        },
      };

      globalThis.distribution.local.routes.put(
        notifyService,
        notifyName,
        (e, v) => {
          if (e) {
            finish(e, null);
            return;
          }

          mrService.keys = configuration.keys;
          mrService.nodes = nodes;
          mrService.orchestrator = orchestratorNode;
          mrService.notifyName = notifyName;
          mrService.mapGid = mapGid;
          mrService.shuffleGid = shuffleGid;

          if (nodes.length === 0) {
            globalThis.distribution.local.routes.rem(notifyName, (e, v) => {
              finish(null, []);
            });
            return;
          }

          let registered = 0;
          nodes.forEach((node) => {
            globalThis.distribution.local.comm.send(
              [mrService, serviceName],
              { node, service: "routes", method: "put" },
              (e, v) => {
                if (finished) return;
                if (e) {
                  finish(e, null);
                  return;
                }
                registered += 1;
                if (registered === nodes.length) {
                  dispatchPhase("map");
                }
              },
            );
          });
        },
      );
    });
  }

  return { exec };
}

module.exports = mr;
