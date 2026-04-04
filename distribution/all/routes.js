// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 *
 * @typedef {Object} Routes
 * @property {(service: object, name: string, callback: Callback) => void} put
 * @property {(configuration: string, callback: Callback) => void} rem
 */

/**
 * @param {Config} config
 * @returns {Routes}
 */
function routes(config) {
  const context = {};
  context.gid = config.gid || 'all';

  /**
   * @param {object} service
   * @param {string} name
   * @param {Callback} callback
   */
  function put(service, name, callback) {
    const dist = globalThis.distribution;
    dist[context.gid].comm.send([service, name], {service: 'routes', method: 'put'}, (e, v) => {
      if (e instanceof Error){
        return callback(e, null);
      }
      return callback(e || {}, v || {});
    });
  }

  /**
   * @param {string} configuration
   * @param {Callback} callback
   */
  function rem(configuration, callback) {
    const dist = globalThis.distribution;
    dist[context.gid].comm.send([configuration], {service: 'routes', method: 'rem'}, (e, v) => {
      if (e instanceof Error){
        return callback(e, null);
      }
      return callback(e || {}, v || {});
    });
  }

  return {put, rem};
}

module.exports = routes;
