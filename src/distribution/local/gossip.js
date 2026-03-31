// @ts-check
/**
 * @typedef {import("../types").Callback} Callback
 * @typedef {import("../types").Node} Node
 *
 * @typedef {Object} Payload
 * @property {{service: string, method: string, node: Node}} remote
 * @property {any} message
 * @property {string} mid
 * @property {string} gid
 * @property {function} subset
 * 
 */

const seen = {};
const log = require('../util/log.js');
const util = globalThis.distribution.util;
/**
 * @param {Payload} payload
 * @param {Callback} callback
 */
function recv(payload, callback) {
  if (payload.mid in seen) {
    log(`${globalThis.distribution.node.config.ip} : seen message`);
    return callback(null, 'seen message');
  } else {
    seen[payload.mid] = true;
    const {service, method} = payload.remote;
    globalThis.distribution.local.routes.get(service, (e, serviceHandler) => {
      if (e) {
        return callback(e);
      } else {
        serviceHandler[method](...payload.message, (e, v) => {
          if (e) {
            log(e.message);
          } else {
            log(v);
          }
          // log(`${globalThis.distribution.node.config.ip} : sent increment`);
          globalThis.distribution.local.groups.get(payload.gid, (e, group) => {
            if (e) {
              return callback(e);
            };
            const chosenSids = util.chooseRandomSlice(Object.keys(group), payload.subset(Object.keys(group)));
            for (const sid of chosenSids) {
              // foward our message
              log('forwarding message');
              globalThis.distribution.local.comm.send([payload], {service: 'gossip', method: 'recv', node: group[sid]}, () => {});
            }
            return callback(null, group);
          });
        });
      }
    });
  }
}

module.exports = {recv};
