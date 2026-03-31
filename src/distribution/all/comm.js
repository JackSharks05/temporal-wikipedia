// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 */

const node = require("../local/node.js");

/**
 * NOTE: This Target is slightly different from local.all.Target
 * @typedef {Object} Target
 * @property {string} service
 * @property {string} method
 * @property {string} [gid]
 *
 * @typedef {Object} Comm
 * @property {(message: any[], configuration: Target, callback: Callback) => void} send
 */

/**
 * @param {Config} config
 * @returns {Comm}
 */
function comm(config) {
  const context = {};
  context.gid = config.gid || 'all';

  /**
   * @param {any[]} message
   * @param {Target} configuration
   * @param {Callback} callback
   */
  function send(message, configuration, callback) {
    globalThis.distribution.local.groups.get(context.gid, (e, group) => {
      if (e) {
        return callback(e);
      }
      if (Object.keys(group).length === 0) {
        return callback(new Error('no nodes in group'));
      }
      /** @type {Object.<string, Error>} */
      const errors = {}
      const values = {}
      let count = 0;
      for (const [sid, node] of Object.entries(group)) {
        const remote = {
          node: node,
          gid: 'local',
          service: configuration.service,
          method: configuration.method
        };
        const cb = (e,v) => {
          count++;
          if (e) {
            errors[sid] = e;
          } else {
            values[sid] = v;
          }
          if (count == Object.keys(group).length) {
            return callback(errors, values);
          }
        }
        globalThis.distribution.local.comm.send(message, remote, cb);
      }
    });
  }
  return {send};
}

module.exports = comm;
