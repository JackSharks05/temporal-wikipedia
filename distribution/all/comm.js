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
  context.gid = config.gid || 'all';

  /**
   * @param {any[]} message
   * @param {Target} configuration
   * @param {Callback} callback
   */
  function send(message, configuration, callback) {
    if (typeof callback !== 'function') callback = () => {};

    const dist = globalThis.distribution;
    const local = dist.local;

    local.groups.get(context.gid,(ge,group) => {
          
      const sids = Object.keys(group);
      if (sids.length === 0) {
        return callback(new Error('comm.send: empty group'), null);
      }

      /** @type {Object.<string, Error>} */
      const errors = Object.create(null);
      /** @type {Object.<string, any>} */
      const values = Object.create(null);
      let count = 0;

      for (let i = 0; i < sids.length; i++) {
        const sid = sids[i];
        const node = group[sid];

        const remote = {node: node, service: configuration && configuration.service,method: configuration && configuration.method};

        if (configuration && typeof configuration.gid === 'string') {
          remote.gid = configuration.gid;
        }

        local.comm.send(message,remote,(e,v) => {
          if (e) {
            errors[sid] = e;
          } else {
            values[sid] = v;
          }

          count++;
          if (count === sids.length) {
            return callback(errors,values);
          }
        });

      }
    });
  }

  return {send};
}

module.exports = comm;
