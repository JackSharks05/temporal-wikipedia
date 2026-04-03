/**
 * @typedef {import("../types").Callback} Callback
 * @typedef {string} ServiceName
 */

const serviceRegistry = {};
const rpcService = new Proxy({}, {
  get: function(target, prop) {
    return function(...args) {
      const wire = require('../util/wire.js');
      const toLocal = wire.toLocal;
      const remotePointer = String(prop);
      const callback = args[args.length - 1];
      if (toLocal.hasOwnProperty(remotePointer)) {
        const func = toLocal[remotePointer];
        try {
          func(...args);
        } catch (err) {
          if (typeof callback === 'function') {
            callback(err instanceof Error ? err : new Error(String(err)));
          }
        }
      } else {
        if (typeof callback === 'function') {
          callback(new Error('RPC function not found: ' + remotePointer));
        }
      }
    };
  },
});

/**
 * @param {ServiceName | {service: ServiceName, gid?: string}} configuration
 * @param {Callback} callback
 * @returns {void}
 */
function get(configuration, callback) {
  // return callback(new Error('routes.get not implemented'));
  callback = callback || function() {};
  if (configuration == null) {
    return callback(new Error('Service name is required'));
  }

  let serviceName;
  let gid = 'local';
  if (typeof configuration === 'string') {
    serviceName = configuration;
  } else if (typeof configuration === 'object' && configuration.service) {
    serviceName = configuration.service;
    gid = configuration.gid || 'local';
  } else {
    return callback(new Error('invalid configuration'));
  }

  if (serviceName === 'rpc') {
    return callback(null, rpcService);
  }

  if (gid == 'local') {
    if (serviceRegistry.hasOwnProperty(serviceName)) {
      return callback(null, serviceRegistry[serviceName]);
    }
    return callback(new Error('Service not found: ' + serviceName));
  }

  if (globalThis.distribution[gid] && globalThis.distribution[gid][serviceName]) {
    return callback(null, globalThis.distribution[gid][serviceName]);
  }

  return callback(new Error('Service not found: ' + serviceName + ' in group ' + gid));
  
}

/**
 * @param {object} service
 * @param {string} configuration
 * @param {Callback} callback
 * @returns {void}
 */
function put(service, configuration, callback) {
  callback = callback || function() {};
  serviceRegistry[configuration] = service;
  return callback(null, configuration);
  // return callback(new Error('routes.put not implemented'));
}

/**
 * @param {string} configuration
 * @param {Callback} callback
 */
function rem(configuration, callback) {
  callback = callback || function() {};
  if (!serviceRegistry.hasOwnProperty(configuration)) {
    return callback(new Error('Service not found: ' + configuration));
  }

  const service = serviceRegistry[configuration];
  delete serviceRegistry[configuration];
  return callback(null, service);
  // return callback(new Error('routes.rem not implemented'));
}

module.exports = {get, put, rem};
