// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 * @typedef {import("../types.js").Node} Node
 */

const { group } = require("yargs");
const id = require('../util/id.js');
const groupsRegistry = {}; // groupName -> {sid: node, ...}

/**
 * @param {string} name
 * @param {Callback} callback
 */
function get(name, callback) {
  callback = callback || function() {};
  if (name === 'all') {
    const localNode = globalThis.distribution.node.config;
    const localSid = id.getSID(localNode);

    if (groupsRegistry.hasOwnProperty('all')) {
      return callback(null, groupsRegistry['all']);
    } else {
      const allGroup = {[localSid]: {ip: localNode.ip, port: localNode.port}};
      groupsRegistry['all'] = allGroup;
      return callback(null, allGroup);
    }
  }

  if (!groupsRegistry.hasOwnProperty(name)) {
    return callback(new Error('Group not found: ' + name));
  } 
  return callback(null, groupsRegistry[name]);
}

/**
 * @param {Config | string} config
 * @param {Object.<string, Node>} group
 * @param {Callback} callback
 */
function put(config, group, callback) {
  callback = callback || function() {};
  let name;
  /**@type {Config} */
  let groupConfig;
  if (typeof config === 'string') {
    name = config;
    groupConfig = {gid: name};

  } else if (config && typeof config === 'object') {
    name = config.gid;
    groupConfig = /** @type {Config} */ (config);
  } else {
    return callback(new Error('Invalid configuration'));
  }

  if (!name) {
    return callback(new Error('Group name is required'));
  }

  groupsRegistry[name] = group || {};
  const {setup} = require('../all/all.js');
  globalThis.distribution[name] = setup(groupConfig);
  return callback(null, group);
}

/**
 * @param {string} name
 * @param {Callback} callback
 */
function del(name, callback) {
  callback = callback || function() {};
  if (!groupsRegistry.hasOwnProperty(name)) {
    return callback(new Error('Group not found: ' + name));
  }

  const group = groupsRegistry[name];
  delete groupsRegistry[name];
  delete globalThis.distribution[name];
  return callback(null, group);
    // return callback(new Error('groups.del not implemented'));
}

/**
 * @param {string} name
 * @param {Node} node
 * @param {Callback} callback
 */
function add(name, node, callback) {
  callback = callback || function() {};

  if (name === 'all' && !groupsRegistry.hasOwnProperty('all')) {
    const localNode = globalThis.distribution.node.config;
    const localSid = id.getSID(localNode);
    groupsRegistry['all'] = {[localSid]: {ip: localNode.ip, port: localNode.port}};
  }

  if (!groupsRegistry.hasOwnProperty(name)) {
    return callback(new Error('Group not found: ' + name));
  }

  const sid = id.getSID(node);
  groupsRegistry[name][sid] = node;
  return callback(null, groupsRegistry[name]);
    // return callback(new Error('groups.add not implemented'));
}

/**
 * @param {string} name
 * @param {string} node
 * @param {Callback} callback
 */
function rem(name, node, callback) {
  // return callback(new Error('groups.rem not implemented'));
  callback = callback || function() {};
  if (!groupsRegistry.hasOwnProperty(name)) {
    return callback(new Error('Group not found: ' + name));

  }

  const removedNode = groupsRegistry[name][node];
  delete groupsRegistry[name][node];
  return callback(null, removedNode);
};

module.exports = {get, put, del, add, rem};
