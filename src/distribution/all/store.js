// @ts-check
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

const local = require("../local/local.js");
const util = require("../util/util.js");
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
    local.groups.get(gid, (e, /** @type {Object.<string, Node>} */ group) => {
      if (e) {
        return callback(e);
      }
      const nids = Object.values(group).map((node) => util.id.getNID(node));
      const nidsToNode = {};
      for (const node of Object.values(group)) {
        nidsToNode[util.id.getNID(node)] = node;
      }
      if (key) {
        const targetNode = nidsToNode[context.hash(util.id.getID(key), nids)];
        const remote = {node: targetNode, service: 'store', method: 'get'};
        const params = {key: key, gid: gid};
        local.comm.send([params], remote, (e, v) => {
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
          local.comm.send([params], remote, (e, v) => {
            if (e) {
              errors[util.id.getNID(node)] = e;
            } else {
              keys.push(...v);
            }
            sent++;
            if (sent == Object.keys(group).length) {
              const unique = [...new Set(keys)];
              if (unique.length !== keys.length) {
                return callback(Error('duplicate keys found'));
              }
              return callback(errors, keys);
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
    local.groups.get(gid, (e, /** @type {Object.<string, Node>} */ group) => {
      if (e) {
        return callback(e);
      }
      const nids = Object.values(group).map((node) => util.id.getNID(node));
      const nidsToNode = {};
      for (const node of Object.values(group)) {
        nidsToNode[util.id.getNID(node)] = node;
      }
      const targetNode = nidsToNode[context.hash(util.id.getID(key), nids)];
      const message = {key: key, gid: gid};
      const remote = {node: targetNode, service: 'store', method: 'put'};
      local.comm.send([state, message], remote, (e, v) => {
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
    local.groups.get(gid, (e, /** @type {Object.<string, Node>} */ group) => {
      if (e) {
        return callback(e);
      }
      const nids = Object.values(group).map((node) => util.id.getNID(node));
      const nidsToNode = {};
      for (const node of Object.values(group)) {
        nidsToNode[util.id.getNID(node)] = node;
      }
      const targetNode = nidsToNode[context.hash(util.id.getID(key), nids)];
      const message = {key: key, gid: gid};
      const remote = {node: targetNode, service: 'store', method: 'append'};
      local.comm.send([state, message], remote, (e, v) => {
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
    local.groups.get(gid, (e, /** @type {Object.<string, Node>} */ group) => {
      if (e) {
        return callback(e);
      }
      const nids = Object.values(group).map((node) => util.id.getNID(node));
      const nidsToNode = {};
      for (const node of Object.values(group)) {
        nidsToNode[util.id.getNID(node)] = node;
      }
      const targetNode = nidsToNode[context.hash(util.id.getID(key), nids)];
      const message = {key: key, gid: gid};
      const remote = {node: targetNode, service: 'store', method: 'del'};
      local.comm.send([message], remote, (e, v) => {
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
    local.groups.get(context.gid, (e, curGroup) => {
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
              return context.hash(util.id.getID(key), oldNids) != context.hash(util.id.getID(key), newNids);
            });
            const handleDone = () => {
              if ((resolved == keysToMove.length)) {
                return callback(null, putResults);
              }
            };
            if (keysToMove.length === 0) return callback(null, {});
            for (const key of keysToMove) {
              const oldNode = oldNidToNode[context.hash(util.id.getID(key), oldNids)];
              const newNode = newNidToNode[context.hash(util.id.getID(key), newNids)];
              const message = {gid: context.gid, key: key};
              const delRemote = {node: oldNode, service: 'store', method: 'del'};
              local.comm.send([message], delRemote, (e, delVal) => {
                if (e) {
                  errors[key] = e;
                  resolved++;
                  handleDone();
                  return;
                };
                const putRemote = {node: newNode, service: 'store', method: 'put'};
                const putMessage = [delVal, {gid: context.gid, key: key}];
                local.comm.send(putMessage, putRemote, (e, putResult) => {
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

  /* For the distributed store service, the configuration will
          always be a string */
  return {get, put, append, del, reconf};
}

module.exports = store;
