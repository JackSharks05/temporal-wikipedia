// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 * @typedef {import("../types.js").SID} SID
 * @typedef {import("../types.js").Node} Node
 *
 * @typedef {Object} Remote
 * @property {Node} node
 * @property {string} service
 * @property {string} method

 * @typedef {Object} Payload
 * @property {Remote} remote
 * @property {any} message
 * @property {string} mid
 * @property {string} gid
 * @property {function} subset
 *
 *@typedef {any[]} message
 * 
 * @typedef {Object} Gossip
 * @property {(payload: Payload, remote: Remote, callback: Callback) => void} send
 * @property {(perod: number, func: () => void, callback: Callback) => void} at
 * @property {(intervalID: NodeJS.Timeout, callback: Callback) => void} del
 */

const { recv } = require("../local/gossip.js");
const util = globalThis.distribution.util;
const log = globalThis.distribution.util.log;
/**
 * @param {Config} config
 * @returns {Gossip}
 */
function gossip(config) {
  const context = {};
  context.gid = config.gid || 'all';
  context.subset = config.subset || function(lst) {
    return Math.ceil(Math.log(lst.length));
  };

  // construct payload on its own

  /**
   * @param {message} message
   * @param {Remote} remote
   * @param {Callback} callback
   */
  function send(message, remote, callback) {
    log('-----------------------------');
    log(`gossip.send called, gid: ${context.gid}`);
    const payload = {
      remote: remote,
      message: message,
      mid: Math.random().toString(36).slice(5),
      gid: context.gid,
      subset: context.subset,
    };
    globalThis.distribution.local.gossip.recv(payload, (e, v) => {
      return callback(e, v);
    });
  }

  /**
   * @param {number} period
   * @param {() => void} func
   * @param {Callback} callback
   */
  function at(period, func, callback) {
    const intervalID = setInterval(() =>{
      func();
    }, period);
    return callback(null, intervalID);
  }

  /**
   * @param {NodeJS.Timeout} intervalID
   * @param {Callback} callback
   */
  function del(intervalID, callback) {
    clearInterval(intervalID);
    return callback(null, intervalID);
  }

  return {send, at, del};
}

module.exports = gossip;
