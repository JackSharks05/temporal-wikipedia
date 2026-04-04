// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 * @typedef {import("../types.js").Node} Node
 *
 * @typedef {Object} Remote
 * @property {Node} [node]
 * @property {string} service
 * @property {string} method
 *
 * @typedef {Object} Payload
 * @property {Remote} remote
 * @property {any} message
 * @property {string} mid
 * @property {string} gid
 *
 * @typedef {Object} Gossip
 * @property {(payload: any, remote: Remote, callback: Callback) => void} send
 * @property {(perod: number, func: () => void, callback: Callback) => void} at
 * @property {(intervalID: NodeJS.Timeout, callback: Callback) => void} del
 */

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

  function send(payload, remote, callback) {
    const dist = globalThis.distribution;

    /** @type {Payload} */
    let p;

    if (payload && typeof payload === 'object' && typeof payload.mid === 'string' && payload.remote) {
      p = payload;
    } else {
      p = {
        remote: remote,
        message: payload,
        gid: context.gid,
        mid: dist.util.id.getMID({gid: context.gid, r:remote, m:payload}),
      };
    }

    dist.local.groups.get(p.gid,(e,group) => {
      const self = dist.util.id.getSID(dist.node.config);
      const sids = Object.keys(group).filter((sid) => sid !== self);
      const k = Math.min(sids.length, context.subset(sids));
      if (k === 0){
        return callback({}, {});
      }

      /** @type {Object.<string, Error>} */
      const errs = Object.create(null);
      let done = 0;

      // choose k random
      const pool = sids.slice();
      for (let i = 0; i < k; i++) {
        const j = Math.floor(Math.random() * pool.length);
        const sid = pool.splice(j,1)[0];

        dist.local.comm.send([p],{node: group[sid],service: 'gossip',method: 'recv'},(e,v) => {
          if (e) {
              errs[sid] = e;
          }
          if (++done === k){
            callback(errs,{});
          }
        });
      }
    });
  }

function at(period, func, callback) {
  const id = setInterval(() => {try{func();} catch (e) {} },period);
  if (id && typeof id.unref === 'function'){
    id.unref();
  }
  return callback(null,id);
}

  function del(intervalID, callback) {
    clearInterval(intervalID);
    return callback(null,intervalID);
  }

  return {send, at, del};
}

module.exports = gossip;