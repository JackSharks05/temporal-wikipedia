// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Node} Node
 *
 * @typedef {Object} Payload
 * @property {{service: string, method: string, node?: Node}} remote
 * @property {any} message
 * @property {string} mid
 * @property {string} gid
 */

const N = 10;
/** @type {Set<string>} */
const seen = new Set();

/**
 * @param {Payload} payload
 * @param {Callback} callback
 */
function recv(payload, callback) {
  if (typeof callback !== 'function'){
    callback = () => {};
  }
  const dist = globalThis.distribution;

  if (seen.has(payload.mid)){
    return callback(null,null);
  }
  seen.add(payload.mid);
  if (seen.size > N){
    seen.delete(seen.values().next().value);
  }

  /** @type {{service: string, method: string, node?: Node}} */
  const r = payload.remote;

  const svc = dist.local && dist.local[r.service];
  const fn = svc && svc[r.method];

  let args;

  if (Array.isArray(payload.message)) {
    args = payload.message.slice();
  } else {
    args = [payload.message];
  }

  
  args.push((e,v) => {
    if (payload.gid && dist[payload.gid] && dist[payload.gid].gossip) {
      dist[payload.gid].gossip.send(payload,payload.remote,() => {});
    }
    return callback(e || null,v);
  });

  fn.apply(null,args);
}

module.exports = {recv};