// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 */

/**
 * @callback RoutesCallback
 * @param {Object.<string,Error> | Error | {}} errors
 * @param {Object.<string, any> | {} | null} values
 * 
 * @typedef {Object} Routes
 * @property {(service: object, name: string, callback: RoutesCallback) => void} put
 * @property {(configuration: string, callback: RoutesCallback) => void} rem
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
   * @param {RoutesCallback} callback
   */
  function put(service, name, callback) {
    callback = callback || function() {};
    const remote = {service: 'routes', method: 'put'};
    globalThis.distribution[context.gid].comm.send(
      [service, name],
      remote,
      (errors, values) => {
        callback(errors, values);
      },
    );
    // return callback(new Error('routes.put not implemented'));
  }

  /**
   * @param {string} configuration
   * @param {RoutesCallback} callback
   */
  function rem(configuration, callback) {
    callback = callback || function() {};
    const remote = {service: 'routes', method: 'rem'};
    globalThis.distribution[context.gid].comm.send(
      [configuration],
      remote,
      (errors, values) => {
        callback(errors, values);
      },
    );
    // return callback(new Error('routes.rem not implemented'));
  }

  return {put, rem};
}

module.exports = routes;
