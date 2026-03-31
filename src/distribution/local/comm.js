// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Node} Node
 */

const http = require('node:http');
const util = require('../util/util.js');
// const { deserialize } = require("node:v8");
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
  if (!Array.isArray(message)) {
    return callback(new Error('message must be array'));
  }
  if (!remote || !remote.service || !remote.node || !remote.node.ip || !remote.node.port || !remote.method) {
    return callback(new Error('Invalid remote node / service / method'));
  }
  callback = callback || function() {};
  const options = {
    hostname: remote.node.ip,
    port: remote.node.port,
    path: `/${remote.gid || 'local'}/${remote.service}/${remote.method}`,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
  };
  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (p) => {
      data+=p;
    });
    res.on('end', () => {
      try {
        const ds = util.deserialize(data);
        return callback(ds[0], ds[1]);
      } catch (e) {
        return callback(e);
      }
    });
  });
  req.on('error', (e) => {
    return callback(new Error(e.message));
  });
  req.end(util.serialize(message));
}

module.exports = {send};
