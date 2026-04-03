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

/**
 * @param {Config} config
 */
function store(config) {
  const context = {
    gid: config.gid || "all",
    hash: config.hash || globalThis.distribution.util.id.naiveHash,
    subset: config.subset,
  };

  function getKey(configuration) {
    if (typeof configuration === "string") {
      return configuration;
    }
    if (configuration && typeof configuration === "object") {
      return configuration.key;
    }
    return null;
  }

  function makeLocalConfig(configuration, key) {
    if (configuration && typeof configuration === "object") {
      return { gid: configuration.gid || context.gid, key };
    }
    return { gid: context.gid, key };
  }

  function chooseNode(key, callback) {
    const kid = globalThis.distribution.util.id.getID(key);
    globalThis.distribution.local.groups.get(context.gid, (e, v) => {
      if (e) {
        if (callback) {
          return callback(e, null);
        }
        return;
      }
      const nodes = Object.values(v);
      if (nodes.length === 0) {
        if (callback) {
          return callback(new Error("Cannot hash into empty group"), null);
        }
        return;
      }
      const nids = nodes.map((n) => globalThis.distribution.util.id.getNID(n));
      const nodeNid = context.hash(kid, nids);
      const node = nodes.find(
        (n) => globalThis.distribution.util.id.getNID(n) === nodeNid,
      );
      if (!node) {
        if (callback) {
          return callback(new Error("Failed to pick node"));
        }
        return;
      }
      if (callback) {
        return callback(null, node);
      }
    });
  }

  /**
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function get(configuration, callback) {
    const key = getKey(configuration);
    if (key === null) {
      // had to implement the all functionality
      globalThis.distribution[context.gid].comm.send(
        [makeLocalConfig(configuration, null)],
        { service: "store", method: "get" },
        (e, v) => {
          const outputSet = new Set();
          if (v && typeof v === "object") {
            Object.values(v).forEach((keys) => {
              if (Array.isArray(keys)) {
                keys.forEach((k) => outputSet.add(k));
              }
            });
          }
          if (callback) {
            callback(e, Array.from(outputSet));
          }
        },
      );
      return;
    }
    chooseNode(key, (e, v) => {
      if (e) {
        if (callback) {
          callback(e, null);
        }
        return;
      }
      globalThis.distribution.local.comm.send(
        [makeLocalConfig(configuration, key)],
        { node: v, service: "store", method: "get" },
        callback,
      );
    });
  }

  /**
   * @param {any} state
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function put(state, configuration, callback) {
    const key =
      getKey(configuration) ?? globalThis.distribution.util.id.getID(state);
    chooseNode(key, (e, v) => {
      if (e) {
        if (callback) {
          callback(e, null);
        }
        return;
      }
      globalThis.distribution.local.comm.send(
        [state, makeLocalConfig(configuration, key)],
        { node: v, service: "store", method: "put" },
        callback,
      );
    });
  }

  /**
   * @param {any} state
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function append(state, configuration, callback) {
    const key =
      getKey(configuration) ?? globalThis.distribution.util.id.getID(state);
    chooseNode(key, (e, v) => {
      if (e) {
        if (callback) {
          callback(e, null);
        }
        return;
      }
      globalThis.distribution.local.comm.send(
        [state, makeLocalConfig(configuration, key)],
        { node: v, service: "store", method: "append" },
        callback,
      );
    });
  }

  /**
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function del(configuration, callback) {
    const key = getKey(configuration);
    if (key == null) {
      if (callback) {
        callback(new Error("Key not found"));
      }
      return;
    }
    chooseNode(key, (e, v) => {
      if (e) {
        callback(e);
        return;
      }
      globalThis.distribution.local.comm.send(
        [makeLocalConfig(configuration, key)],
        { node: v, service: "store", method: "del" },
        callback,
      );
    });
  }

  /**
   * @param {Object.<string, Node>} configuration
   * @param {Callback} callback
   */
  function reconf(configuration, callback) {
    return callback(new Error("store.reconf not implemented"));
  }

  /* For the distributed store service, the configuration will
          always be a string */
  return { get, put, append, del, reconf };
}

module.exports = store;
