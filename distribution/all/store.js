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
    gid: config.gid || 'all',
    hash: config.hash || globalThis.distribution.util.id.naiveHash,
    subset: config.subset,
  };

  /** helper getter func : given key get target node 
   * @param {string} key
   * @param {Callback} callback
   */
  function getTargetNode(key, callback) {
    const kid = globalThis.distribution.util.id.getID(key);
    globalThis.distribution.local.groups.get(context.gid, (err, group) => {
      if (err) {
        return callback(err);
      }
      const nodes = Object.values(group);
      const nids =nodes.map((node) => globalThis.distribution.util.id.getNID(node),);
      if (nids.length === 0) {
        return callback(new Error('No nodes in group'));
      }

      const targetNid = context.hash(kid, nids);
      for (const node of nodes) {
        if (globalThis.distribution.util.id.getNID(node) === targetNid) {
          return callback(null, node);
        }
      }
      return callback(new Error('Target node not found'));
    });
  }
  
  /**
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function get(configuration, callback) {
    callback = callback || function() {};
    if (configuration === null) {
      globalThis.distribution[context.gid].comm.send(
        [{key: null, gid: context.gid}],
        {service: 'store', method: 'get'},
        (errors, values) => {
          const allKeys = [];
          for (const sid in values) {
            if (Array.isArray(values[sid])) {
              allKeys.push(...values[sid]);
            }
          }
          callback(errors, allKeys);
        },
      );
      return;
    }
    // return callback(new Error('store.get not implemented'));
    const key = typeof configuration === 'string' ? configuration : configuration.key;
    const gid = (typeof configuration === 'object' && configuration.gid) ? configuration.gid : context.gid;
    if (key === null) {
      globalThis.distribution[context.gid].comm.send(
        [{key:null, gid: context.gid}],
        {service: 'store', method: 'get'},
        (errors, values) => {
          const allKeys = [];
          for (const sid in values) {
            if (Array.isArray(values[sid])) {
              allKeys.push(...values[sid]);
            }
          }
          callback(errors, allKeys);
        },
      );
      return;
    }

    getTargetNode(key, (err, node) => {
      if (err) {
        return callback(err);
      }

      const remote = {
        node: node,
        service: 'store',
        method: 'get',
      };

      globalThis.distribution.local.comm.send(
        [{key: key, gid:gid}],
        remote,
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
    callback = callback || function() {};
    let key;
    let gid = context.gid;
    if (configuration === null) {
      key = globalThis.distribution.util.id.getID(state);
    } else if (typeof configuration === 'string') {
      key = configuration;
    } else {
      key = configuration.key;
      if (key === null) {
        key = globalThis.distribution.util.id.getID(state);
      }

      if (configuration.gid) {
        gid = configuration.gid;
      }
    }

    getTargetNode(key, (err, node) => {
      if (err) {
        return callback(err);
      }
      const remote = {
        node: node,
        service: 'store',
        method: 'put',
      };

      globalThis.distribution.local.comm.send(
        [state, {key: key, gid: gid}],
        remote,
        callback,
      );
    });
    // return callback(new Error('store.put not implemented'));
  }

  /**
   * @param {any} state
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function append(state, configuration, callback) {
    callback = callback || function() {};
    const key = typeof configuration === 'string' ? configuration : configuration?.key;
    const gid = (typeof configuration === 'object' && configuration?.gid) ? configuration.gid : context.gid;
    if (!key) {
      return callback(new Error('Key required for append'));
    }
    getTargetNode(key, (err, node) => {
      if (err) {
        return callback(err);
      }
      const remote = {
        node: node,
        service: 'store',
        method: 'append',
      };
      globalThis.distribution.local.comm.send(
        [state, {key: key, gid: gid}],
        remote,
        callback,
      );
    });
   //return callback(new Error('store.append not implemented')); // You'll need to implement this method for the distributed processing milestone.
  }

  /**
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function del(configuration, callback) {
    callback = callback || function() {};
    const key = typeof configuration === 'string' ? configuration : configuration?.key;
    const gid = (typeof configuration === 'object' && configuration?.gid) ? configuration.gid : context.gid;
    if (!key) {
      return callback(new Error('Key required for delete'));
    }
    getTargetNode(key, (err, node) => {
      if (err) {
        return callback(err);
      }
      const remote = {
        node: node,
        service: 'store',
        method: 'del',
      };
      globalThis.distribution.local.comm.send(
        [{key:key, gid: gid}],
        remote,
        callback,
      );
    });
  //  return callback(new Error('store.del not implemented'));
  }

  /**
   * @param {Object.<string, Node>} configuration
   * @param {Callback} callback
   */
  function reconf(configuration, callback) {
    return callback(new Error('store.reconf not implemented'));
  }

  /* For the distributed store service, the configuration will
          always be a string */
  return {get, put, append, del, reconf};
}

module.exports = store;
