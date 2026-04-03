// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Node} Node
 * @typedef {import("../types.js").Hasher} Hasher
 */
const log = require('../util/log.js');
const crypto = require('node:crypto');

const toLocal = {};

/**
 * @returns {string}
 */
function generateRemotePointer() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * @param {Function} func
<<<<<<< HEAD
 * 
=======
 * @returns {Function} func
>>>>>>> upstream/main
 */
function createRPC(func) {
  // Write some code...

  const nodeConfig = globalThis.distribution.node.config;
  const nodeInfo = {ip: nodeConfig.ip, port: nodeConfig.port};
  const remotePointer = generateRemotePointer();
  toLocal[remotePointer] = func;

  const stubString = `function(...args) {
    const callback = args.pop();
    const remote = {
      node: {ip: "${nodeInfo.ip}", port: ${nodeInfo.port}},
      service: "rpc",
      method: "${remotePointer}"
    };
    globalThis.distribution.local.comm.send(args, remote, callback);
  }`;

  const rpcStub = new Function('return ' + stubString)();
  return rpcStub;
}

/**
 * The toAsync function transforms a synchronous function that returns a value into an asynchronous one,
 * which accepts a callback as its final argument and passes the value to the callback.
 * @param {Function} func
 */
function toAsync(func) {

  // It's the caller's responsibility to provide a callback
  const asyncFunc = (/** @type {any[]} */ ...args) => {
    const callback = args.pop();
    try {
      const result = func(...args);
      return callback(null, result);
    } catch (error) {
      return callback(error);
    }
  };

  /* Overwrite toString to return the original function's code.
   Otherwise, all functions passed through toAsync would have the same id. */
  asyncFunc.toString = () => func.toString();
  return asyncFunc;
}


module.exports = {
  createRPC,
  toAsync,
  toLocal,
};
