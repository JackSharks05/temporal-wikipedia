// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Node} Node
 */

const id = require('../util/id.js');
const {spawn: spawnProcess} = require('node:child_process');
// const { defaultMaxListeners } = require("node:events");
// const { read } = require("node:fs");
const path = require('node:path');

let messageCount = 0;
function incrementCount() {
  messageCount++;
}

/**
 * @param {string} configuration
 * @param {Callback} callback
 */
function get(configuration, callback) {
  // return callback(new Error('status.get not implemented'));
  callback = callback || function() {};
  const config = globalThis.distribution.node.config;

  switch(configuration) {
    case 'nid':
      return callback(null, id.getNID(config));
    case 'sid':
      return callback(null, id.getSID(config));
    case 'ip':
      return callback(null, config.ip);
    case 'port':
      return callback(null, config.port);
    case 'counts':
      return callback(null, messageCount);
    case 'heapTotal':
      return callback(null, process.memoryUsage().heapTotal);
    case 'heapUsed':
      return callback(null, process.memoryUsage().heapUsed);
    default:
      return callback(new Error('Status key not found: ' + configuration));
  }
};


/**
 * @param {Node} configuration
 * @param {Callback} callback
 */
function spawn(configuration, callback) {
  callback = callback || function() {};

  if (!configuration || !configuration.ip || !configuration.port) {
    return callback(new Error('Invalid node configuration'));
  }

  const distributionPath = path.join(__dirname, '..', '..', 'distribution.js');
  const serializedConfig = globalThis.distribution.util.serialize(configuration);
  const child = spawnProcess('node', [
    distributionPath,
    '--config',
    serializedConfig,
  ], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  const http = require('node:http');
  let attempts = 0;
  const maxAttempts = 30;

  const checkReady = () => {
    attempts++;
    const req = http.request({
      hostname: configuration.ip,
      port: configuration.port,
      path: '/local/status/get',
      method: 'PUT',
      timeout: 100,
    }, (res) => {
      let data = '';
      res.on('data', (chunk)=> data += chunk);
      res.on('end', () => {
        callback(null, configuration);

      });
    });

    req.on('error', () => {
      if (attempts < maxAttempts) {
        setTimeout(checkReady, 100);
      } else {
        callback(new Error('Spawned node did not start in time'));
      }
    });

    req.on('timeout', () => {
      req.destroy();
      if (attempts < maxAttempts) {
        setTimeout(checkReady, 100);
      } else {
        callback(new Error('Spawned node did not start in time'));
      }
    });
    req.write(globalThis.distribution.util.serialize(['sid']));
    req.end();
  };
  setTimeout(checkReady, 100);
  // callback(new Error('status.spawn not implemented'));
}

/**
 * @param {Callback} callback
 */
function stop(callback) {
  // callback(new Error('status.stop not implemented'));
  callback = callback || function() {};
  const server = globalThis.distribution.node.server;
  callback(null, null);
  if (server) {
    setImmediate(() => {
      server.close(() => {});
    });
  }
  // if (server) {
  //   server.close(() => {
  //     callback(null, null);
  //   });
  // } else {
  //   callback(null, null);
  // }
}

module.exports = {get, spawn, stop, incrementCount};
