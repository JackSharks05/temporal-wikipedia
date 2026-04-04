// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 * @typedef {import("../util/id.js").Node} Node
 *
 * @typedef {Object} Status
 * @property {(configuration: string, callback: Callback) => void} get
 * @property {(configuration: Node, callback: Callback) => void} spawn
 * @property {(callback: Callback) => void} stop
 */

/**
 * @param {Config} config
 * @returns {Status}
 */
function status(config) {
  const context = {};
  context.gid = config.gid || 'all';

function get(configuration, callback) {
  if (typeof callback !== 'function') callback = () => {};
  const dist = globalThis.distribution;

  dist[context.gid].comm.send([configuration], {service: 'status', method: 'get'}, (e, v) => {
    if (e instanceof Error){
      return callback(e,null);
    }

    /** @type {Object.<string, Error>} */
    const errs = /** @type {any} */ (e || Object.create(null));

    if (Object.keys(errs).length){
      return callback(errs, {});
    }
    const vals = Object.values(v || {});
    if (configuration === 'nid' || configuration === 'sid'){
      return callback({}, vals);
    }
    if (configuration === 'heapTotal'){
      return callback({}, vals.reduce((a,x) => a+x,0));
    }
    if (configuration === 'heapUsed'){
      return callback({}, v);
    }
    return callback({},v);
  });
}

  function stop(callback) {
    if (typeof callback !== 'function') callback = () => {};
    const dist = globalThis.distribution;
    const local = dist.local;
    const self = dist.util.id.getSID(dist.node.config);

    local.groups.get(context.gid, (e, group) => {
      if (e || !group) return callback(e || new Error('status.stop: group not found'),null);

      const sids = Object.keys(group).filter((sid) =>sid !== self);
      /** @type {Object.<string, Error>} */
      const errs = Object.create(null);
      /** @type {Object.<string, any>} */
      const vals = Object.create(null);
      if (sids.length === 0) return callback(errs,vals);


      let done = 0;
      sids.forEach((sid) =>{
        local.comm.send([],{node: group[sid],service: 'status',method: 'stop'},(er,v) => {
          if (er){
            errs[sid] = er;
          }
          else{
            vals[sid] = v;
          }
          if (++done === sids.length){
            callback(errs,vals);
          }
        });
      });
    });
  }

  function spawn(configuration, callback) {
    if (typeof callback !== 'function') callback = () =>{};
    const dist = globalThis.distribution;
    const local = dist.local;
    const id = dist.util.id;

    dist.local.status.spawn(configuration,(e,nodeInfo) => {
      if (e){
        return callback(e,null);
      }

      local.groups.get(context.gid,(ge,group) => {
        const newGroup = Object.assign({},group);
        newGroup[id.getSID(nodeInfo)] = nodeInfo;

        local.groups.put(context.gid,newGroup, () => {});


        dist[context.gid].comm.send([context.gid,newGroup],{service: 'groups', method: 'put'},(pe) => {
          if (pe instanceof Error){
            return callback(pe,null);
          }
          return callback(null,nodeInfo);
        });
      });
    });
  }

  return {get, stop, spawn};
}

module.exports = status;