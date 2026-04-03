// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 * @typedef {import("../util/id.js").Node} Node
 */

const id = require('../util/id.js');

/**
 * @callback StatusCallback
 * @param {Object.<string, Error> | Error | {}} errors
 * @param {Object.<string, any> | null} values
 * 
 * @typedef {Object} Status
 * @property {(configuration: string, callback: StatusCallback) => void} get
 * @property {(configuration: Node, callback: StatusCallback) => void} spawn
 * @property {(callback: StatusCallback) => void} stop
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
   * @param {StatusCallback} callback
   */
  function get(configuration, callback) {
    callback = callback || function() {};
    const remote = {service: 'status', method: 'get'};
    globalThis.distribution[context.gid].comm.send(
      [configuration],
      remote,
      (errors, values) => {
        callback(errors, values);
      },
    );
    // callback(new Error('status.get not implemented'));
  }

  /**
   * @param {Node} configuration
   * @param {StatusCallback} callback
   */
  function spawn(configuration, callback) {
    // callback(new Error('status.spawn not implemented')); // If you won't implement this, check the skip.sh script.
    callback = callback || function() {};
    globalThis.distribution.local.status.spawn(configuration, (err, val) => {
      if (err) {
        return callback(err, null);
      }

      const nodeSid = id.getSID(configuration);
      const remote = {service: 'groups', method: 'add'};

      globalThis.distribution[context.gid].comm.send(
        [context.gid, configuration],
        remote,
        (errors, values) => {
          callback(errors, values);
        },
      );

    });
  }

  /**
   * @param {StatusCallback} callback
   */
  function stop(callback) {
    // callback(new Error('status.stop not implemented')); // If you won't implement this, check the skip.sh script.
    callback = callback || function() {};
    const localNode = globalThis.distribution.node.config;
    const localSid = id.getSID(localNode);

    globalThis.distribution.local.groups.get(context.gid, (err, group) => {
      if(err) {
        return callback(err, null);
      }

      const errors = {};
      const values = {};
      let completed = 0;

      const nodes = Object.entries(group).filter(([sid, node]) => sid !== localSid);

      if (nodes.length === 0) {
        return callback({},{});
      }

      const total = nodes.length;
      nodes.forEach(([sid, node]) => {
        const remote = {
          node: node,
          service: 'status',
          method: 'stop',
        };
        globalThis.distribution.local.comm.send([], remote, (e,v) => {
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
  }

  return {get, stop, spawn};
}

module.exports = status;
