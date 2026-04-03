// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 * @typedef {import("../util/id.js").Node} Node
 */
/** 
 * @callback GroupsCallback
 * @param {Object.<string, Error> | Error | {}} errors
 * @param {Object.<string, any> | {} | null} values
 *  
 * @typedef {Object} Groups
 * @property {(config: Config | string, group: Object.<string, Node>, callback: GroupsCallback) => void} put
 * @property {(name: string, callback: GroupsCallback) => void} del
 * @property {(name: string, callback: GroupsCallback) => void} get
 * @property {(name: string, node: Node, callback: GroupsCallback) => void} add
 * @property {(name: string, node: string, callback: GroupsCallback) => void} rem
 */

/**
 * @param {Config} config
 * @returns {Groups}
 */
function groups(config) {
  const context = {gid: config.gid || 'all'};

  /**
   * @param {Config | string} groupConfig
   * @param {Object.<string, Node>} group
   * @param {GroupsCallback} callback
   */
  function put(groupConfig, group, callback) {
    // return callback(new Error('groups.put not implemented'));
    callback = callback || function() {};

    const remote = {service: 'groups', method: 'put'};
    globalThis.distribution[context.gid].comm.send(
      [groupConfig, group],
      remote,
      (errors, values) => {
        callback(errors, values);
      },
    );
  }

  /**
   * @param {string} name
   * @param {GroupsCallback} callback
   */
  function del(name, callback) {
    // return callback(new Error('groups.del not implemented'));
    callback = callback || function() {};
    const remote = {service: 'groups', method: 'del'};
    globalThis.distribution[context.gid].comm.send(
      [name],
      remote,
      (errors, values) => {
        callback(errors, values);
      },
    );
  }

  /**
   * @param {string} name
   * @param {GroupsCallback} callback
   */
  function get(name, callback) {  
    callback = callback || function() {};
    const remote = {service: 'groups', method: 'get'};
    globalThis.distribution[context.gid].comm.send(
      [name],
      remote,
      (errors, values) => {
        callback(errors, values);
      },
    );
    // return callback(new Error('groups.get not implemented'));
  }

  /**
   * @param {string} name
   * @param {Node} node
   * @param {GroupsCallback} callback
   */
  function add(name, node, callback) {
    // return callback(new Error('groups.add not implemented'));
    callback = callback || function() {};
    const remote = {service: 'groups', method: 'add'};
    globalThis.distribution[context.gid].comm.send(
      [name, node],
      remote,
      (errors, values) => {
        callback(errors, values);
      },
    );
  }

  /**
   * @param {string} name
   * @param {string} nodeSid
   * @param {GroupsCallback} callback
   */
  function rem(name, nodeSid, callback) {
    // return callback(new Error('groups.rem not implemented'));
    callback = callback || function() {};
    const remote = {service: 'groups', method: 'rem'};
    globalThis.distribution[context.gid].comm.send(
      [name, nodeSid],
      remote,
      (errors, values) => {
        callback(errors, values);
      },
    );
  }

  return {
    put, del, get, add, rem,
  };
}

module.exports = groups;
