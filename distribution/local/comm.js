// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Node} Node
 */

const http = require('node:http');
const { hostname } = require("node:os");

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
  callback = callback || function() {};
  if (message !== null && message !== undefined && !Array.isArray(message)) {
    return callback(new Error('Message must be an array'));
  }

  if (!remote) {
    return callback(new Error('Remote configuration is required'));
  }

  if (!remote.node) {
    return callback(new Error('Remote node is required'));
  }
  if (!remote.node.ip) {
    return callback(new Error('Remote node IP is required'));
  }
  if (!remote.node.port) {
    return callback(new Error('Remote node port is required'));
  }
  if (!remote.service) {
    return callback(new Error('Remote service is required'));
  }
  if (!remote.method) {
    return callback(new Error('Remote method is required'));
  }

  if (typeof remote.service !== 'string' || remote.service === '') {
    return callback(new Error('Remote service must be a non-empty string'));
  }

  if (typeof remote.method !== 'string' || remote.method === '') {
    return callback(new Error('Remote method must be a non-empty string'));
  }

  const gid = remote.gid || 'local';
  const path = `/${gid}/${remote.service}/${remote.method}`;

  let serializedMessage;
  try {
    serializedMessage = globalThis.distribution.util.serialize(message);

  } catch (err) {
    return callback(new Error('Failed to serialized message: ' + err.message));
  }

  const options = {
    hostname: remote.node.ip,
    port: remote.node.port,
    path: path,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(serializedMessage),
    },
    timeout: 5000,
  };

  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      try {
        const result = globalThis.distribution.util.deserialize(data);
        if(Array.isArray(result)) {
          const [error, value] = result;
          return callback(error, value);
        } else if (result instanceof Error) {
          return callback(result);
        } else {
          return callback(new Error('Invalid response format'));
        }
      } catch (err) {
        return callback(new Error('Failed to deserialize response: ' + err.messgae));
      }
    });
  });

  req.on('error', (err)=> {
    return callback(new Error('Request failed: ' + err.message));
  });

  // handle request timeout
  req.on('timeout', () => {
    req.destroy();
    return callback(new Error('Request timed out'));
  })
  req.write(serializedMessage);
  req.end();


  // return callback(new Error('comm.send not implemented'));
}

module.exports = {send};
