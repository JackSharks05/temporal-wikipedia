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
  context.gid = config.gid || "all";

  /**
   * @param {object} service
   * @param {string} name
   * @param {Callback} callback
   */
  function put(service, name, callback) {
    globalThis.distribution[context.gid].comm.send(
      [service, name],
      { service: "routes", method: "put" },
      (e, v) => {
        callback(e, v);
      },
    );
  }

  /**
   * @param {string} configuration
   * @param {Callback} callback
   */
  function rem(configuration, callback) {
    globalThis.distribution[context.gid].comm.send(
      [configuration],
      { service: "routes", method: "rem" },
      (e, v) => {
        callback(e, v);
      },
    );
  }

  return { put, rem };
}

module.exports = routes;
