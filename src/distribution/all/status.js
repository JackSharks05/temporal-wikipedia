// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 * @typedef {import("../util/id.js").Node} Node
 *
 * @typedef {Object} Status
 * @property {(configuration: string, callback: Callback) => void} get
 * @property {(configuration: Node, callback: Callback) => void} spawn
 * @property {(callback: Callback) => void} stop
 */

/**
 * @param {Config} config
 * @returns {Status}
 */
function status(config) {
  const context = {};
  context.gid = config.gid || 'all';

  /**
   * @param {string} configuration
   * @param {Callback} callback
   */
  function get(configuration, callback) {
    const remote = {service: 'status', method: 'get' };
    globalThis.distribution[context.gid].comm.send([configuration], remote, (e,v) => {
      if (configuration == 'heapTotal') {
        let total = 0;
        for (const [key, val] of Object.entries(v)) {
          if (typeof(val) == 'number') {
            total += val;
          } else {
            console.log(`bad status ${key}, ${val}`);
          }
        }
        return callback(e, total);
      }
      if (configuration === 'heapUsed' || Object.keys(v).length === 0) {
        return callback(e, v);
      }
      return callback(e, Object.values(v));
    });
  }

  /**
   * @param {Node} configuration
   * @param {Callback} callback
   */
function spawn(configuration, callback) {
  globalThis.distribution.local.status.spawn(configuration, (e, v) => {
    if (e) return callback(e);
    globalThis.distribution.local.groups.add(context.gid, configuration, (e2, v2) => {
      globalThis.distribution[context.gid].groups.add(context.gid, configuration, (e3, v3) => {
        callback(null, configuration);
      });
    });
  });
}

  /**
   * @param {Callback} callback
   */
  function stop(callback) {
    const remote = {service: 'status', method: 'stop'};
    globalThis.distribution[context.gid].comm.send([], remote, (e, v) => {
      if (e) {
        return callback(e);
      }
      callback(null, v);
    });
  }

  return {get, stop, spawn};
}

module.exports = status;
