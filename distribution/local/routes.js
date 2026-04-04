/**
 * @typedef {import("../types").Callback} Callback
 * @typedef {string} ServiceName
 */


/**
 * @param {ServiceName | {service: ServiceName, gid?: string}} configuration
 * @param {Callback} callback
 * @returns {void}
 */

const table = Object.create(null);


function get(configuration, callback) {
  if (typeof callback !== 'function') {
    callback = () => {};
  }

  let name = null;
  let gid = 'local';

  if (typeof configuration === 'string') {
    name = configuration;
  } 
  else if (configuration && typeof configuration === 'object') {
    name = configuration.service;
    if (typeof configuration.gid === 'string' && configuration.gid.length > 0) {
      gid = configuration.gid;
    }
  }

  if (!name) {
    return callback(new Error('routes.get: not found'), null);
  }

  if (gid === 'local') {
    if (!table[name]) {
      return callback(new Error('routes.get: not found'), null);
    }
    return callback(null,table[name]);
  }

   
  const dist = globalThis.distribution;
  const groupObj = dist && dist[gid];
  const svc = groupObj && groupObj[name];

  if (!svc) {
    return callback(new Error('routes.get: not found'), null);
  }
  return callback(null, svc);
}

/**
 * @param {object} service
 * @param {string} configuration
 * @param {Callback} callback
 * @returns {void}
 */
function put(service, configuration, callback) {
  if (typeof callback !== 'function'){
    callback = () => {};
  }
  table[configuration] = service;
  return callback(null, configuration);
}

/**
 * @param {string} configuration
 * @param {Callback} callback
 */
function rem(configuration, callback) {
  if (typeof callback !== 'function'){
    callback = () => {};
  }
 
  const svc = table[configuration];
  if (!svc){
    
    return callback(new Error('routes.rem: not found'), null);
  }

  delete table[configuration];
  return callback(null, svc);
}

module.exports = {get, put, rem};
