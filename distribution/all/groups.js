// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 * @typedef {import("../util/id.js").Node} Node
 *
 * @typedef {Object} Groups
 * @property {(config: Config | string, group: Object.<string, Node>, callback: Callback) => void} put
 * @property {(name: string, callback: Callback) => void} del
 * @property {(name: string, callback: Callback) => void} get
 * @property {(name: string, node: Node, callback: Callback) => void} add
 * @property {(name: string, node: string, callback: Callback) => void} rem
 */

/**
 * @param {Config} config
 * @returns {Groups}
 */
function groups(config) {
  const context = {gid: config.gid || 'all'};

  /**
   * @param {Config | string} config
   * @param {Object.<string, Node>} group
   * @param {Callback} callback
   */
  function put(config, group, callback) {
    const dist = globalThis.distribution;
    dist[context.gid].comm.send([config,group],{service: 'groups',method: 'put'},(e,v) => {
      if (e instanceof Error){
        return callback(e, null);
      }
      return callback(e || {}, v || {});
    });
  }

  /**
   * @param {string} name
   * @param {Callback} callback
   */
  function del(name, callback) {
    const dist = globalThis.distribution;
    dist[context.gid].comm.send([name],{service: 'groups',method: 'del'},(e,v) => {
      if (e instanceof Error){
        return callback(e,null);
      }
      return callback(e || {}, v || {});
    });
  }


  /**
   * @param {string} name
   * @param {Callback} callback
   */
  function get(name, callback) {
    const dist = globalThis.distribution;
    dist[context.gid].comm.send([name],{service: 'groups',method: 'get'},(e,v) => {

      if (e instanceof Error){
        return callback(e,null);
      }
      return callback(e || {}, v || {});
    });
  }

  /**
   * @param {string} name
   * @param {Node} node
   * @param {Callback} callback
   */
  function add(name, node, callback) {
    const dist = globalThis.distribution;
    dist[context.gid].comm.send([name,node],{service: 'groups',method: 'add'},(e,v) => {
      if (e instanceof Error){
        return callback(e,null);
      }
      return callback(e || {}, v || {});
    });
  }

  /**
   * @param {string} name
   * @param {string} node
   * @param {Callback} callback
   */
  function rem(name, node, callback) {
    const dist = globalThis.distribution;
    dist[context.gid].comm.send([name,node],{service: 'groups',method: 'rem'},(e,v) => {
      if (e instanceof Error){
        return callback(e,null);
      }
      return callback(e || {}, v || {});
    });
  }

  return {
    put, del, get, add, rem,
  };
}

module.exports = groups;
