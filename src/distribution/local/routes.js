/**
 * @typedef {import("../types").Callback} Callback
 * @typedef {string} ServiceName
 */

const routes = {};
/**
 * @param {ServiceName | {service: ServiceName, gid?: string}} configuration
 * @param {Callback} callback
 * @returns {void}
 */
function get(configuration, callback) {
  let service;
  let gid = 'local';
  if (typeof configuration == 'string') {
    service = configuration;
  } else if (configuration && typeof configuration == 'object' && configuration.service) {
    service = configuration.service;
    gid = configuration.gid || 'local';
  } else {
    return callback(new Error('invalid config'));
  }
  if (gid == 'local') {
    if (service in routes) {
      return callback(null, routes[service]);
    } else {
      return callback(new Error(`Service ${service} not in routes`));
    }
  }
  else {
    if (!(gid in globalThis.distribution)) {
      return callback(new Error(`gid ${gid} not in distribution`));
    }
    if (!(service in globalThis.distribution[gid])) {
      return callback(new Error(`service ${service} not in ${gid}`));
    }
    return callback(null, globalThis.distribution[gid][service]);
  }
}

/**
 * @param {object} service
 * @param {string} configuration
 * @param {Callback} callback
 * @returns {void}
 */
function put(service, configuration, callback) {
  routes[configuration] = service;
  return callback(null, configuration);
}

/**
 * @param {string} configuration
 * @param {Callback} callback
 */
function rem(configuration, callback) {
  if (configuration in routes) {
    const service = routes[configuration];
    delete routes[configuration];
    return callback(null, service);
  } else {
    return callback(new Error(`Service ${configuration} not in routes`));
  }
}

module.exports = {get, put, rem};
