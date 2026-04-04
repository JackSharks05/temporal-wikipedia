// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Node} Node
 */

const http = require('node:http');

/**
 * @typedef {Object} Target
 * @property {string} service
 * @property {string} method
 * @property {Node} node
 * @property {string} [gid]
 */

/**
 * @param {Array<any>} message
 * @param {Target} remote
 * @param {(error: Error, value?: any) => void} callback
 * @returns {void}
 */
function send(message, remote, callback) {
  if (typeof callback !== 'function') {
    callback = () => {};
  }

  if (!remote || !remote.node) {
    return callback(new Error('comm.send: missing node'), null);
  }
  if (!remote.node.ip) {
    return callback(new Error('comm.send: missing ip'), null);
  }
  if (remote.node.port === undefined || remote.node.port === null) {
    return callback(new Error('comm.send: missing port'), null);
  }
  if (typeof remote.service !== 'string' || remote.service.length === 0) {
    return callback(new Error('comm.send: missing service'), null);
  }
  if (typeof remote.method !== 'string' || remote.method.length === 0) {
    return callback(new Error('comm.send: missing method'), null);
  }
  if (!Array.isArray(message)) {
    return callback(new Error('comm.send: message must be an array'), null);
  }

  //build path
  let gid = 'local';
  if (remote.gid) {
    gid = remote.gid;
  }

  // /<gid>/<service>/<method>
  const path = '/' + gid + '/' + remote.service + '/' + remote.method;


  const util = globalThis.distribution.util;
  const body = util.serialize(message);

  //config http
  const options = {
    hostname: remote.node.ip,
    port: remote.node.port,
    path: path,
    method: 'PUT',
    agent: false,
    headers: {
      'Content-Type': 'application/json',
      'Connection': 'close',
    },
  };

  //send http
  const req = http.request(options, (response) => {
    
    let data = '';//accumulate response
    response.on('data', (chunk) => {
      data = data + chunk;
    });

    response.on('end', () => {
      const decoded = util.deserialize(data);

      if (!Array.isArray(decoded) || decoded.length !== 2) {
        return callback(new Error('comm.send: bad response'), null);
      }

      
      return callback(decoded[0], decoded[1]);//error, value
    
    });
  });

  req.on('error', (error) => {
    callback(new Error(String(error)), null);
  });
  
  req.write(body);
  req.end();
}

module.exports = {send};
