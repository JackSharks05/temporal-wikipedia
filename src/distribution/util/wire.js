// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Node} Node
 * @typedef {import("../types.js").Hasher} Hasher
 */
const log = require('../util/log.js');
const crypto = require('crypto');

/**
 * @param {Function} func
 * @returns {Function} func
 */
function createRPC(func) {
  const ptr = crypto.randomBytes(32).toString('hex');
  if (!globalThis.distribution.toLocal) {
    globalThis.distribution.toLocal = {};
  }
  globalThis.distribution.toLocal[ptr] = func;

  function stub(...args) {
    const cb = args.pop();
    const remote = {
      node: {ip: '__NODE_IP__', port: '__NODE_PORT__'},
      gid: 'local',
      service: 'rpc',
      method: '__FUNC_ID__',
    };
    // @ts-ignore
    return globalThis.distribution.local.comm.send(args, remote, cb);
  }
  const config = globalThis.distribution.node.config;
  let stub_str = stub.toString()
      .replace('__NODE_IP__', config.ip)
      .replace('__NODE_PORT__', String(config.port))
      .replace('__FUNC_ID__', ptr);
  return new Function('return ' + stub_str)();
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
};
