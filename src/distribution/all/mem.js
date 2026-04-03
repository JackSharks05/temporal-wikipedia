// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 * @typedef {import("../types.js").Node} Node
 */

/**
 * @typedef {Object} StoreConfig
 * @property {string | null} key
 * @property {string} gid
 *
 * @typedef {StoreConfig | string | null} SimpleConfig
 *
 * @typedef {Object} Mem
 * @property {(configuration: SimpleConfig, callback: Callback) => void} get
 * @property {(state: any, configuration: SimpleConfig, callback: Callback) => void} put
 * @property {(state: any, configuration: SimpleConfig, callback: Callback) => void} append
 * @property {(configuration: SimpleConfig, callback: Callback) => void} del
 * @property {(configuration: Object.<string, Node>, callback: Callback) => void} reconf
 */

/**
 * @param {Config} config
 * @returns {Mem}
 */
function mem(config) {
  const context = {};
  context.gid = config.gid || "all";
  context.hash = config.hash || globalThis.distribution.util.id.naiveHash;

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
    const kid =
      typeof key === "string" && /^[0-9a-f]{64}$/i.test(key)
        ? key
        : globalThis.distribution.util.id.getID(key);
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
    let output;
    let error = null;
    const key = getKey(configuration);
    if (key == null) {
      error = new Error(`Key ${configuration} not found`);
      if (callback) {
        return callback(error, output);
      }
      return;
    }
    chooseNode(key, (e, v) => {
      if (e) {
        if (callback) {
          callback(e);
        }
        return;
      }
      globalThis.distribution.local.comm.send(
        [makeLocalConfig(configuration, key)],
        { node: v, service: "mem", method: "get" },
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
          callback(e);
        }
        return;
      }
      globalThis.distribution.local.comm.send(
        [state, makeLocalConfig(configuration, key)],
        { node: v, service: "mem", method: "put" },
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
    return callback(new Error("mem.append not implemented")); // You'll need to implement this method for the distributed processing milestone.
  }

  /**
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function del(configuration, callback) {
    const key = getKey(configuration);
    if (key === null) {
      if (callback) {
        callback(new Error("Key not found"), null);
      }
      return;
    }
    chooseNode(key, (e, node) => {
      if (e) {
        callback(e);
        return;
      }
      globalThis.distribution.local.comm.send(
        [makeLocalConfig(configuration, key)],
        { node, service: "mem", method: "del" },
        callback,
      );
    });
  }

  /**
   * @param {Object.<string, Node>} configuration
   * @param {Callback} callback
   */
  function reconf(configuration, callback) {
    return callback(new Error("mem.reconf not implemented"));
  }
  /* For the distributed mem service, the configuration will
          always be a string */
  return {
    get,
    put,
    append,
    del,
    reconf,
  };
}

module.exports = mem;
