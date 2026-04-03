// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 *
 * @typedef {Object} StoreConfig
 * @property {string | null} key
 * @property {string | null} gid
 *
 * @typedef {StoreConfig | string | null} SimpleConfig
 */

const mem = require("../all/mem.js");

// storage struct: {gid: {key: value}}
const memoryStore = {};

/**
 * helper function: extract key and gid from config
 * @param {SimpleConfig} configuration
 * @returns {{key: string | null, gid: string}}
 */
function parseConfig(configuration) {
  if (configuration === null) {
    return {key: null, gid: 'local'};
  }

  if (typeof configuration === 'string') {
    return {key: configuration, gid: 'local'};
  }
  return {
    key: configuration.key || null,
    gid: configuration.gid || 'local',
  };
}

/**
 * key generator from obejct using id.getID
 * @param {any} state
 * @returns {string}
 */
function generateKey(state) {
  return globalThis.distribution.util.id.getID(state);
}

/**
 * @param {any} state
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function put(state, configuration, callback) {
  callback = callback || function() {};
  const {key: rawKey, gid} = parseConfig(configuration);
  const key = rawKey === null ? generateKey(state) : rawKey;

  if (!memoryStore[gid]) {
    memoryStore[gid] = {};
  }
  memoryStore[gid][key] = state;
  return callback(null, state);
  // return callback(new Error('mem.put not implemented'));
};

/**
 * @param {any} state
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function append(state, configuration, callback) {
  // return callback(new Error('mem.append not implemented')); // You'll need to implement this method for the distributed processing milestone.
  callback = callback || function() {};
  const {key: rawKey, gid} = parseConfig(configuration);
  if (rawKey === null) {
    return callback(new Error('Key required for append'));
  }

  if (!memoryStore[gid]) {
    memoryStore[gid] = {};
  }

  let existing = memoryStore[gid][rawKey];
  if (existing === undefined) {
    existing = [];
  } else if (!Array.isArray(existing)) {
    existing = [existing];
  }

  existing.push(state);
  memoryStore[gid][rawKey] = existing;
  return callback(null, existing);
};

/**
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function get(configuration, callback) {
  callback = callback || function() {};
  const {key, gid} = parseConfig(configuration);
  if (!memoryStore[gid]) {
    memoryStore[gid] = {};
  }

  if (key === null) {
    return callback(null, Object.keys(memoryStore[gid]));
  }
  if (!memoryStore[gid].hasOwnProperty(key)) {
    return callback(new Error('Key not found: ' + key));
  }
  return callback(null, memoryStore[gid][key]);

  // return callback(new Error('mem.get not implemented'));
}

/**
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function del(configuration, callback) {
  callback = callback || function() {};
  const {key, gid} = parseConfig(configuration);
  if (key === null) {
    return callback(new Error('Key required for delete'));
  }

  if (!memoryStore[gid]) {
    memoryStore[gid] = {};
  }

  if (!memoryStore[gid].hasOwnProperty(key)) {
    return callback(new Error('Key not found: ' + key));
  }

  const value = memoryStore[gid][key];
  delete memoryStore[gid][key];
  return callback(null, value);
  // return callback(new Error('mem.del not implemented'));
};

module.exports = {put, get, del, append};
