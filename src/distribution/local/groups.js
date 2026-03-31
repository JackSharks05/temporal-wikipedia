//@ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 * @typedef {import("../types.js").Node} Node
 * @typedef {import("../all/all.js").GroupServices} GroupService
 */

const { id } = require("../util/util.js");

/** @type {Object.<string, Object.<string, Node>>} */
const groups = {};
groups['local'] = {[id.getSID(globalThis.distribution.node.config)]: distribution.node.config};
groups['all'] = {[id.getSID(globalThis.distribution.node.config)]: distribution.node.config};
/**
 * @param {string} name
 * @param {Callback} callback
 */
function get(name, callback) {
  if (name in groups) {
    return callback(null, groups[name]);
  }
  return callback(new Error(`name not ${name} not in groups`));
}

/**
 * @param {Config | string} config
 * @param {Object.<string, Node>} group
 * @param {Callback} callback
 */
function put(config, group, callback) {
  let gid = typeof config != 'string' ? config.gid : config;
  if (!globalThis.distribution[gid]) {
    globalThis.distribution[gid] = {};
    const {setup} = require('../all/all.js');
    globalThis.distribution[gid] = setup(typeof config === 'object' ? config : {gid: gid});
  }
  groups[gid] = {...group};
  return callback(null, groups[gid]);
}

/**
 * @param {string} name
 * @param {Callback} callback
 */
function del(name, callback) {
  if (!(name in groups)) {
    return callback(Error(`del name ${name}, but name not in groups`));
  }
  const old_groups = groups[name];
  delete groups[name];
  delete globalThis.distribution[name];
  return callback(null, old_groups);
}

/**
 * @param {string} name
 * @param {Node} node
 * @param {Callback} callback
 */
function add(name, node, callback) {
  if (!(name in groups)) {
    return callback(new Error(`missing group ${name}`));
  }
  groups[name][id.getSID(node)] = node;
  if (callback) return callback(null, groups[name]);
};

/**
 * @param {string} name
 * @param {string} node
 * @param {Callback} callback
 */
function rem(name, node, callback) {
  if (!(name in groups)) {
    return callback(new Error(`name ${name} not in groups`));
  }
  if (!(Object.keys(groups[name]).includes(node))) {
    return callback(new Error(`node ${node} not in ${groups[name]}`));
  }
  delete groups[name][node];
  return callback(null, groups[name]);
};

module.exports = {get, put, del, add, rem};
