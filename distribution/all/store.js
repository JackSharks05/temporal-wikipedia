// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 * @typedef {import("../types.js").Hasher} Hasher
 * @typedef {import("../types.js").Node} Node
 */


/**
 * @typedef {Object} StoreConfig
 * @property {string | null} key
 * @property {string} gid
 *
 * @typedef {StoreConfig | string | null} SimpleConfig
 */


/**
 * @param {Config} config
 */
function store(config) {
  const context = {
    gid: config.gid || 'all',
    hash: config.hash || globalThis.distribution.util.id.naiveHash,
    subset: config.subset,
  };

  function parseConfig(configuration) {
    let key = null;
    let gid = context.gid;



    if (typeof configuration === 'string' || configuration === null) {
      key = configuration;
    } 
    else if (configuration && typeof configuration === 'object') {
      if (typeof configuration.key === 'string' || configuration.key === null) {
        key = configuration.key;
      }
      if (typeof configuration.gid === 'string' && configuration.gid.length > 0) {
        gid = configuration.gid;
      }
    }
    return {key, gid};
  }

  function pickNode(key, cb) {
    const dist = globalThis.distribution;
    const id = dist.util.id;

    dist.local.groups.get(context.gid,(e,group) => {
      if (e){
        return cb(e,null);
      }

      const nodes = Object.values(group);
      const nids = nodes.map((n) => id.getNID(n));
      const nid = context.hash(id.getID(key),nids);
      const node = nodes.filter((n) => id.getNID(n) === nid)[0];

      return cb(null,node);
    });
  }

  /**
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function get(configuration, callback) {
    const dist = globalThis.distribution;
    const cfg = parseConfig(configuration);
    const key = cfg.key;

    if (key === null) {
      return dist[context.gid].comm.send([{gid:context.gid,key:null}],{service: 'store',method: 'get'},(e,v) => {//all nodes in group will get the local mem keys
          if (e instanceof Error){
            return callback(e, null);
          }
          const errs = Object.assign({}, e || {});
          const vals = v || {};
          let out = [];
          Object.values(vals).forEach((lst) => {
            if (Array.isArray(lst)){
              out = out.concat(lst);
            }
          });
          return callback(errs,out);
        },
      );
    }

    pickNode(key,(e,node) => {
      if (e){
        return callback(e,null);
      }
      const remote = {node: node,service: 'store',method: 'get'};
      return dist.local.comm.send([{gid: cfg.gid,key: key}],remote,callback);
    });
  }

  /**
   * @param {any} state
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function put(state,configuration,callback) {

    const dist = globalThis.distribution;
    const id = dist.util.id;
    const cfg = parseConfig(configuration);

    const keyArg = cfg.key;
    

    let routeKey;
    if (keyArg === null) {
      routeKey = id.getID(state);
    } else {
      routeKey = keyArg;
    }

    pickNode(routeKey, (e, node) => {
      if (e){
        return callback(e,null);
      }
      const remote = {node: node,service: 'store',method: 'put'};
      return dist.local.comm.send([state,{gid: cfg.gid,key: keyArg}],remote,callback);
    });
  }

  /**
   * @param {any} state
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function append(state, configuration, callback) {
    return callback(new Error('store.append not implemented')); // You'll need to implement this method for the distributed processing milestone.
  }

  /**
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function del(configuration, callback) {
    const dist = globalThis.distribution;
    const cfg = parseConfig(configuration);
    const key = cfg.key;

    pickNode(key,(e,node) => {
      if (e){
        return callback(e,null);
      } 
      const remote = {node: node,service: 'store',method: 'del'};
      return dist.local.comm.send([{gid: cfg.gid,key: key}],remote,callback);
    });
  }

  /**
   * @param {Object.<string, Node>} configuration
   * @param {Callback} callback
   */
  function reconf(configuration, callback) {
    const dist = globalThis.distribution;
    const id = dist.util.id;
    const svc = 'store';

    
    const send = (node,method,args,cb) => {
      return dist.local.comm.send(args,{node: node,service: svc,method: method},cb);
    };

    dist.local.groups.get(context.gid,(e,newGroup) => {
      if (e){
        return callback(e,null);
      }

      const oldSids = Object.keys(configuration);

      const keySet = new Set();
      let pending = oldSids.length;

      //1
      oldSids.forEach((sid) => {
        send(configuration[sid],'get',[{gid: context.gid, key: null}],(e,keys) => {
          if (!e){
            keys.forEach((k) => keySet.add(k));
          }
          if (--pending === 0){
            decideAndMove();
          }
        });
      });

      function decideAndMove() {
        const keys = Array.from(keySet);
        const oldNids = Object.values(configuration).map((n) => id.getNID(n));
        const newNids = Object.values(newGroup).map((n) => id.getNID(n));

        //2
        const todo = [];
        keys.forEach((key) => {
          const kid = id.getID(key);
          const fromSid = context.hash(kid,oldNids).substring(0,5);
          const toSid = context.hash(kid,newNids).substring(0,5);

          if (fromSid !== toSid){
            todo.push([key, fromSid, toSid]);
          }
        });

        //3
        let i = 0;
        (function next() {
          if (i === todo.length){
            return callback(null, todo.length);
          }

          const t = todo[i];
          i++;
          const key = t[0];
          const fromNode = configuration[t[1]];
          const toNode = newGroup[t[2]];
          if (!fromNode|| !toNode){
            return next();
          }

          const config = {gid: context.gid,key: key};

          send(fromNode,'get',[config],(e1,val) => {
            if (e1){
              return callback(e1, null);
            }
            send(fromNode,'del',[config],(e2) => {
              if (e2){
                return callback(e2, null);
              }
              send(toNode,'put',[val,config],(e3) => {
                if (e3){
                  return callback(e3,null);
                }
                next();
              });
            });
          });
        })();
      }
    });
  }

   
  /* For the distributed store service, the configuration will
          always be a string */
  return {get, put, append, del, reconf};
}

module.exports = store;
