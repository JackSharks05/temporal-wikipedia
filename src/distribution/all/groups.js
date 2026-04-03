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
  const context = { gid: config.gid || "all" };

  /**
   * @param {Config | string} config
   * @param {Object.<string, Node>} group
   * @param {Callback} callback
   */
  function put(config, group, callback) {
    // let name;
    // if (typeof config === "string") {
    //   name = config;
    // } else {
    //   name = config.gid;
    // }
    globalThis.distribution[context.gid].comm.send(
      [config, group],
      { service: "groups", method: "put" },
      (e, v) => {
        return callback(e, v);
      },
    );
  }

  /**
   * @param {string} name
   * @param {Callback} callback
   */
  function del(name, callback) {
    globalThis.distribution[context.gid].comm.send(
      [name],
      { service: "groups", method: "del" },
      (e, v) => {
        callback(e, v);
      },
    );
  }

  /**
   * @param {string} name
   * @param {Callback} callback
   */
  function get(name, callback) {
    globalThis.distribution[context.gid].comm.send(
      [name],
      { service: "groups", method: "get" },
      (e, v) => {
        callback(e, v);
      },
    );
  }

  /**
   * @param {string} name
   * @param {Node} node
   * @param {Callback} callback
   */
  function add(name, node, callback) {
    globalThis.distribution[context.gid].comm.send(
      [name, node],
      { service: "groups", method: "add" },
      (e, v) => {
        callback(e, v);
      },
    );
  }

  /**
   * @param {string} name
   * @param {string} node
   * @param {Callback} callback
   */
  function rem(name, node, callback) {
    globalThis.distribution[context.gid].comm.send(
      [name, node],
      { service: "groups", method: "rem" },
      (e, v) => {
        callback(e, v);
      },
    );
  }

  return {
    put,
    del,
    get,
    add,
    rem,
  };
}

module.exports = groups;
