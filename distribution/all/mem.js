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
  context.gid = config.gid || 'all';
  context.hash = config.hash || globalThis.distribution.util.id.naiveHash;


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
        {service: 'mem', method: 'get'},
        (errors, values) => {
          const allKeys = [];
          for (const sid in values) {
            if (Array.isArray(values[sid])) {
              allKeys.push(...values[sid]);
            }
          }
          callback(errors, allKeys);
        },
      )
      return;
    } 

    const key = typeof configuration === 'string' ? configuration : configuration.key;
    if (key === null) {
      globalThis.distribution[context.gid].comm.send(
        [{key: null, gid: context.gid}],
        {service: 'mem', method: 'get'},
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
        service: 'mem',
        method: 'get',
      };

      globalThis.distribution.local.comm.send(
        [{key: key, gid: context.gid}],
        remote,
        callback,
      );
    });

    // return callback(new Error('mem.get not implemented'));
  }

  /**
   * @param {any} state
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function put(state, configuration, callback) {
    callback = callback || function() {};
    let key;
    if (configuration === null) {
      key = globalThis.distribution.util.id.getID(state);
    } else if (typeof configuration === 'string') {
      key = configuration;
    } else {
      key = configuration.key;
      if (key === null) {
        key = globalThis.distribution.util.id.getID(state);
      }
    }

    getTargetNode(key, (err, node) => {
      if (err) {
        return callback(err);
      }

      const remote = {
        node: node,
        service: 'mem',
        method: 'put',
      };
      globalThis.distribution.local.comm.send(
        [state, {key:key, gid: context.gid}],
        remote,
        callback,
      );
    });
    // return callback(new Error('mem.put not implemented'));
  }

  /**
   * @param {any} state
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function append(state, configuration, callback) {
    callback = callback || function() {};
    const key = typeof configuration === 'string' ? configuration : configuration?.key;
    if (!key) {
      return callback(new Error('Key required for append'));


    }

    getTargetNode(key, (err, node) => {
      if (err) {
        return callback(err);
      }

      const remote = {
        node: node,
        service: 'mem',
        method: 'append',
      };
      globalThis.distribution.local.comm.send(
        [state, {key: key, gid: context.gid}],
        remote,
        callback,
      );
    });
   // return callback(new Error('mem.append not implemented')); // You'll need to implement this method for the distributed processing milestone.
  }

  /**
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function del(configuration, callback) {
    callback = callback || function() {};
    const key = typeof configuration === 'string' ? configuration : configuration?.key;
    if (!key) {
      return callback(new Error('Key required fro delete'));

    }
    getTargetNode(key, (err, node) => {
      if (err) {
        return callback(err);
      }
      const remote = {
        node: node,
        service: 'mem',
        method: 'del',
      };
      globalThis.distribution.local.comm.send(
        [{key:key, gid:context.gid}],
        remote,
        callback,
      );
    });
   // return callback(new Error('mem.del not implemented'));
  }

  /**
   * @param {Object.<string, Node>} configuration
   * @param {Callback} callback
   */
  function reconf(configuration, callback) {
    return callback(new Error('mem.reconf not implemented'));
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
