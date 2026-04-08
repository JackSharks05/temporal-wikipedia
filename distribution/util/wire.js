// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Node} Node
 * @typedef {import("../types.js").Hasher} Hasher
 */
const log = require('../util/log.js');


/**
 * @param {Function} func
 * @returns {Function} func
 */
function createRPC(func) {
  const distribution = globalThis.distribution;
  const util = distribution.util;
  const id = util && util.id;

  if (!globalThis.toLocal) {
    globalThis.toLocal = new Map();
  }

  if (!distribution.local.rpc) {
    distribution.local.rpc = Object.create(null);
    if (distribution.local.routes && typeof distribution.local.routes.put === 'function') {
      distribution.local.routes.put(distribution.local.rpc, 'rpc', () => {});
    }
  }

  const cfg = distribution.node && distribution.node.config ? distribution.node.config : {};
  const hostNode = {ip: cfg.ip || '127.0.0.1', port: cfg.port || 1234};

  const methodName = (id && typeof id.getID === 'function') ?
    id.getID({src: func.toString(), t: Date.now(), r: Math.random()}) :
    (String(Date.now()) + '_' + String(Math.random()).slice(2));

  distribution.local.rpc[methodName] = func;
  if (globalThis.toLocal instanceof Map) {
    globalThis.toLocal.set(methodName, func);
  }

  function stubTemplate() {
    const args = Array.prototype.slice.call(arguments);
    const cb = (typeof args[args.length - 1] === 'function') ? args.pop() : () => {};

    const remote = /** @type {any} */ ({
      node: "__NODE_INFO__",
      service: 'rpc',
      method: "__METHOD_NAME__",
    });

  return globalThis.distribution.local.comm.send(args, remote, cb);
  }

  let code = stubTemplate.toString();
  code = code.replace('"__NODE_INFO__"', JSON.stringify(hostNode));
  code = code.replace('"__METHOD_NAME__"', JSON.stringify(methodName));

  const rpcStub = Function('return (' + code + ')')();

  rpcStub.toString = () => code;

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
};
