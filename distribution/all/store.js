
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 * @typedef {import("../types.js").Hasher} Hasher
 * @typedef {import("../types.js").Node} Node
 */


/**
 * @typedef {Object} StoreConfig
 * @property {string | null} key
 * @property {string} gid
 *
 * @typedef {StoreConfig | string | null} SimpleConfig
 */


const getLocal = () => globalThis.distribution.local;
const util = require("../util/util.js");

function getPlacementKey(key) {
  if (typeof key !== 'string') {
    return key;
  }
  let match = key.match(/^article-(meta|manifest|year-history):([^:]+)$/);
  if (match) {
    return `article-home:${match[2]}`;
  }
  match = key.match(/^article-segment:([^:]+):[^:]+$/);
  if (match) {
    return `article-home:${match[1]}`;
  }
  return key;
}


/**
 * @param {Config} config
 */
function store(config) {
  const context = {
    gid: config.gid || 'all',
    hash: config.hash || globalThis.distribution.util.id.naiveHash,
    subset: config.subset,
  };

  /**
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function get(configuration, callback) {
    const key = (typeof(configuration) == 'string' || configuration == null) ? /** @type {string | null} */ (configuration) : configuration.key;
    const gid = (configuration != null && typeof(configuration) == 'object' && configuration.gid) ? configuration.gid : context.gid;
    getLocal().groups.get(gid, (e, /** @type {Object.<string, Node>} */ group) => {
      if (e) {
        return callback(e);
      }
      const nids = Object.values(group).map((node) => util.id.getNID(node));
      const nidsToNode = {};
      for (const node of Object.values(group)) {
        nidsToNode[util.id.getNID(node)] = node;
      }
      if (key) {
        const placementKey = getPlacementKey(key);
        const targetNode = nidsToNode[context.hash(util.id.getID(placementKey),nids)];
        const remote = {node: targetNode, service: 'store', method: 'get'};
        const params = {key: key, gid: gid};
        getLocal().comm.send([params], remote, (e, v) => {
          return callback(e, v);
        });
      } else {
        const keys = [];
        /** @type {Object.<String, Error>} */
        const errors = {};
        let sent = 0;
        for (const node of Object.values(group)) {
          const remote = {node: node, service: 'store', method: 'get'};
          const params = {key: key, gid: gid};
          getLocal().comm.send([params], remote, (e, v) => {
            if (e) {
              errors[util.id.getNID(node)] = e;
            } else {
              keys.push(...v);
            }
            sent++;
            if (sent == Object.keys(group).length) {
              const unique = [...new Set(keys)];
              return callback(errors, unique);
            }
          });
        }
      }
    });
  }

  /**
   * @param {any} state
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function put(state, configuration, callback) {
    /** @type {string | null} */
    const key = ((configuration == null || typeof(configuration) === 'string') ? /** @type {string | null} */ (configuration) : configuration.key) || util.id.getID(state);
    const gid = (configuration != null && typeof(configuration) == 'object' && configuration.gid) ? configuration.gid : context.gid;
    getLocal().groups.get(gid, (e, /** @type {Object.<string, Node>} */ group) => { // NEW
      if (e) {
        return callback(e);
      }
      const nids = Object.values(group).map((node) => util.id.getNID(node));
      const nidsToNode = {};
      for (const node of Object.values(group)) {
        nidsToNode[util.id.getNID(node)] = node;
      }
      const placementKey = getPlacementKey(key);
      const targetNode = nidsToNode[context.hash(util.id.getID(placementKey),nids)];
      const message = {key: key, gid: gid};
      const remote = {node: targetNode, service: 'store', method: 'put'};
      getLocal().comm.send([state, message], remote, (e, v) => { // NEW
        if (e) {
          return callback(Error(e.message));
        }
        return callback(null, v);
      });
    });
  }

  /**
   * @param {any} state
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function append(state, configuration, callback) {
    globalThis.distribution.util.log(`append called ${configuration}`, 'info');
    const key = ((configuration == null || typeof(configuration) === 'string') ? configuration : configuration.key) || util.id.getID(state);
    const gid = (configuration != null && typeof(configuration) == 'object' && configuration.gid) ? configuration.gid : context.gid;
    getLocal().groups.get(gid, (e, /** @type {Object.<string, Node>} */ group) => {
      if (e) {
        return callback(e);
      }
      const nids = Object.values(group).map((node) => util.id.getNID(node));
      const nidsToNode = {};
      for (const node of Object.values(group)) {
        nidsToNode[util.id.getNID(node)] = node;
      }
      const placementKey = getPlacementKey(key);
      const targetNode = nidsToNode[context.hash(util.id.getID(placementKey),nids)];
      const message = {key: key, gid: gid};
      const remote = {node: targetNode, service: 'store', method: 'append'};
      getLocal().comm.send([state, message], remote, (e, v) => {
        if (e) {
          return callback(Error(e.message));
        }
        return callback(null, v);
      });
    });
  }

  /**
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function del(configuration, callback) {
    /** @type {string | null} */
    const key = ((configuration == null || typeof(configuration) === 'string') ? /** @type {string | null} */ (configuration) : configuration.key);
    const gid = (configuration != null && typeof(configuration) == 'object' && configuration.gid) ? configuration.gid : context.gid;
    if (key == null) {
      return callback(Error(`can't delete null key`));
    }
    getLocal().groups.get(gid, (e, /** @type {Object.<string, Node>} */ group) => {
      if (e) {
        return callback(e);
      }
      const nids = Object.values(group).map((node) => util.id.getNID(node));
      const nidsToNode = {};
      for (const node of Object.values(group)) {
        nidsToNode[util.id.getNID(node)] = node;
      }
      const placementKey = getPlacementKey(key);
      const targetNode = nidsToNode[context.hash(util.id.getID(placementKey), nids)];
      const message = {key: key, gid: gid};
      const remote = {node: targetNode, service: 'store', method: 'del'};
      getLocal().comm.send([message], remote, (e, v) => {
        if (e) {
          return callback(Error(e.message));
        }
        return callback(null, v);
      });
    });
  }

  /**
   * @param {Object.<string, Node>} configuration
   * @param {Callback} callback
   */
    /**
     * @param {Object.<string, Node>} configuration
     * @param {Callback} callback
     */
  function reconf(configuration, callback) {
    getLocal().groups.get(context.gid, (e, curGroup) => {
      local.groups.put(context.gid, configuration, (e, v) => {
        const config = {
          gid: context.gid,
          key: null,
        };
        get(config, (e, keys) => {
          if (Object.keys(e).length > 0) {
            return callback(e); // not sure what to do with this error
          }
          local.groups.put(context.gid, curGroup, (e, curConfiguration) => {
            if (e) {
              return callback(e);
            }
            if (keys.length == 0) {
              return callback(null);
            }
            const oldNidToNode = {};
            const newNidToNode = {};
            const oldNids = Object.entries(configuration).map((obj) => {
              const nid = util.id.getNID(obj[1]);
              oldNidToNode[nid] = obj[1];
              return nid;
            });
            const newNids = Object.entries(curConfiguration).map((obj) => {
              const nid = util.id.getNID(obj[1]);
              newNidToNode[nid] = obj[1];
              return nid;
            });
            /** @type {Object<string, Error>} */
            const errors = {};
            const putResults = {};
            let resolved = 0;
            const keysToMove = keys.filter((key) => {
              const placementKey = getPlacementKey(key);
              return context.hash(util.id.getID(placementKey),oldNids) !=
                context.hash(util.id.getID(placementKey), newNids);
            });
            const handleDone = () => {
              if ((resolved == keysToMove.length)) {
                return callback(null, putResults);
              }
            };
            if (keysToMove.length === 0) return callback(null, {});
            for (const key of keysToMove) {
              const placementKey = getPlacementKey(key);
              const oldNode = oldNidToNode[context.hash(util.id.getID(placementKey),oldNids)];
              const newNode = newNidToNode[context.hash(util.id.getID(placementKey),newNids)];
              const message = {gid: context.gid, key: key};
              const delRemote = {node: oldNode, service: 'store', method: 'del'};
              getLocal().comm.send([message], delRemote, (e, delVal) => {
                if (e) {
                  errors[key] = e;
                  resolved++;
                  handleDone();
                  return;
                };
                const putRemote = {node: newNode, service: 'store', method: 'put'};
                const putMessage = [delVal, {gid: context.gid, key: key}];
                getLocal().comm.send(putMessage, putRemote, (e, putResult) => {
                  if (e) {
                    errors[key] = e;
                    resolved++;
                    handleDone();
                    return;
                  }
                  putResults[key] = putResult;
                  resolved++;
                  handleDone();
                });
              });
            }
          });
        });
      });
    });
  }
 

 function dispatchBatch(method, resultField, states, configurations, callback) {
    if (!Array.isArray(states) || !Array.isArray(configurations) ||
        states.length !== configurations.length) {
      return callback(new Error('store.' + method + ': states and configurations must be parallel arrays'));
    }
    if (states.length === 0) return callback(null, {[resultField]: 0});

    getLocal().groups.get(context.gid, (e, /** @type {Object.<string, Node>} */ group) => {
      if (e) return callback(e);

      const nids = Object.values(group).map((n) => util.id.getNID(n));
      const nidToNode = {};
      for (const node of Object.values(group)) nidToNode[util.id.getNID(node)] = node;

      /** @type {Object.<string, {node: Node, states: any[], configurations: Object[]}>} */
      const batches = Object.create(null);

      for (let i = 0; i < states.length; i++) {
        const cfg = configurations[i];
        const key = (cfg && typeof cfg === 'object' && typeof cfg.key === 'string') ? cfg.key : null;
        if (!key) {
          return callback(new Error('store.' + method + ': each config must have a string key'));
        }
        const gid = (cfg && cfg.gid) || context.gid;
        const placementKey = getPlacementKey(key);
        const nid = context.hash(util.id.getID(placementKey), nids);
        const node = nidToNode[nid];
        if (!node) {
          return callback(new Error('store.' + method + ': no node for key ' + key));
        }
        const sid = util.id.getSID(node);
        if (!batches[sid]) batches[sid] = {node, states: [], configurations: []};
        batches[sid].states.push(states[i]);
        batches[sid].configurations.push({key, gid});
      }

      const groups = Object.values(batches);
      let outstanding = groups.length;
      let total = 0;
      /** @type {Error|null} */
      let firstErr = null;

      for (const g of groups) {
        const remote = {node: g.node, service: 'store', method};
        getLocal().comm.send([g.states, g.configurations], remote, (err, res) => {
          if (err && !firstErr) firstErr = err;
          if (res && typeof res[resultField] === 'number') total += res[resultField];
          if (--outstanding === 0) {
            callback(firstErr, firstErr ? null : {[resultField]: total});
          }
        });
      }
    });
  }

  /**
   * @param {any[]} states
   * @param {Object[]} configurations
   * @param {Callback} callback
   */
  function putBatch(states, configurations, callback) {
    return dispatchBatch('putBatch', 'written', states, configurations, callback);
  }

  /**
   * @param {any[]} states
   * @param {Object[]} configurations
   * @param {Callback} callback
   */
  function appendBatch(states, configurations, callback) {
    return dispatchBatch('appendBatch', 'appended', states, configurations, callback);
  }

  return {get, put, append, del, reconf, putBatch, appendBatch};
}

module.exports = store;
