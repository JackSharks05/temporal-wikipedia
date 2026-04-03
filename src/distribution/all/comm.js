// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 */

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
  context.gid = config.gid || "all";

  /**
   * @param {any[]} message
   * @param {Target} configuration
   * @param {Callback} callback
   */
  function send(message, configuration, callback) {
    // console.log(
    //   "[all.comm.send] context.gid =",
    //   context.gid,
    //   "message =",
    //   message,
    //   "target =",
    //   configuration,
    // );
    globalThis.distribution.local.groups.get(context.gid, (e, group) => {
      if (e) {
        return callback(e, null);
      }

      let values = {};
      let errors = {};
      let messagesReceived = 0;
      let totalNodes = Object.keys(group).length;
      if (totalNodes === 0) {
        return callback(new Error("Cannot send to empty group"), null);
      }
      Object.entries(group).forEach(([sid, node]) => {
        const remote = {
          node: node,
          service: configuration.service,
          method: configuration.method,
          gid: configuration.gid,
        };
        globalThis.distribution.local.comm.send(message, remote, (e, v) => {
          messagesReceived += 1;
          if (e) {
            errors[sid] = e;
            // values[sid] = v;
          } else {
            values[sid] = v;
          }
          if (messagesReceived === totalNodes) {
            if (Object.keys(errors).length === 0) {
              callback({}, values);
            } else {
              callback(errors, values);
            }
          }
        });
      });
    });
  }

  return { send };
}

module.exports = comm;
