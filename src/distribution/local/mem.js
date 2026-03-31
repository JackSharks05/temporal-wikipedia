// @ts-check
/**
 * @typedef {import("../types.js").Node} Node
 * @typedef {import("../types.js").Callback} Callback
 */
/**
 * @param {any} state
 * @typedef {import("../types.js").SimpleConfig} SimpleConfig
 **/

const { config } = require("yargs");
const local = require("./local.js");
const crypto = require('crypto');
const util = require("../util/util.js");
const localMem = {
  local: {},
};

/**
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function put(state, configuration, callback) {
  let memory;
  /** @type {string} */
  let key;
  if (typeof(configuration) == 'string' || configuration == null) {
    memory = localMem.local;
    key = configuration == null ? util.id.getID(state) : /** @type {string} */ (configuration);
  } else {
    if (typeof(configuration) == 'object' && configuration.gid) {
      localMem[configuration.gid] = localMem[configuration.gid] || {};
      memory = localMem[configuration.gid];
      key = configuration.key || util.id.getID(state);
    } else {
      return callback(Error('memory put must be a SimpleConfig type or string'));
    }
  }
  memory[key] = state;
  return callback(null, state);
};

/**
 * @param {any} state
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function append(state, configuration, callback) {
  return callback(new Error('mem.append not implemented')); // You'll need to implement this method for the distributed processing milestone.
};

/**
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function get(configuration, callback) {
  let memory;
  /** @type {string | null} */
  let key;
  if (typeof(configuration) == 'string' || configuration == null) {
    memory = localMem.local;
    key = /** @type {string | null} */ (configuration);
  } else {
    if (typeof(configuration) == 'object' && configuration.gid) {
      localMem[configuration.gid] = localMem[configuration.gid] || {};
      memory = localMem[configuration.gid];
      key = configuration.key || null;
    } else {
      return callback(Error('memory get must be a SimpleConfig type or string'));
    }
  };
  if (key == null) {
    return callback(null, Object.keys(memory));
  }
  if (!(key in memory)) {
    return callback(Error(`key ${key} not in memory`));
  }
  return callback(null, memory[key]);
}

/**
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function del(configuration, callback) {
  let memory;
  let key;
  if (typeof(configuration) == 'string') {
    memory = localMem.local;
    key = configuration;
  } else {
    if (typeof(configuration) == 'object' && configuration.gid && configuration.key) {
      localMem[configuration.gid] = localMem[configuration.gid] || {};
      memory = localMem[configuration.gid];
      key = configuration.key;
    } else {
      return callback(Error('memory get must be a SimpleConfig type or string'));
    }
  };
  if (!(key in memory)) {
    return callback(Error(`key ${key} not in local memory of group ${typeof(configuration) == 'string' ? 'local' : configuration.key}`));
  }
  const oldVal = memory[key];
  delete memory[key];
  return callback(null, oldVal);
};

module.exports = {put, get, del, append};
