// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 */

const { getSID } = require("../util/id.js");

/**
 * NOTE: This Target is slightly different from local.all.Target
 * @typedef {Object} Target
 * @property {string} service
 * @property {string} method
 * @property {string} [gid]
 *
 * @callback CommCallback
 * @param {Object.<string, Error> | Error | {}} errors
 * @param {Object.<string, any> | null} values
 * 
 * @typedef {Object} Comm
 * @property {(message: any[], configuration: Target, callback: CommCallback) => void} send
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
   * @param {CommCallback} callback
   */
  function send(message, configuration, callback) {
    callback = callback || function() {};
    globalThis.distribution.local.groups.get(context.gid, (err, group) => {
      if (err) {
        return callback(err, null);
      }

      const nodes = Object.entries(group);

      if (nodes.length === 0) {
        return callback(new Error('Group is empty'), null);
      }

      const errors = {};
      const values = {};
      let completed = 0;
      const total = nodes.length;

      nodes.forEach(([sid, node]) => {
        const remote = {
          node: node,
          service: configuration.service,
          method: configuration.method,
          gid: configuration.gid || 'local',
        };

        globalThis.distribution.local.comm.send(message, remote, (e,v) => {
          completed++;
          if (e) {
            errors[sid] = e;  
          } else {
            values[sid] = v;
          }
          
          if (completed === total) {
            callback(errors, values);
          }
        });
      });
    });
    // callback(new Error('comm.send not implemented'));
  }

  return {send};
}

module.exports = comm;
