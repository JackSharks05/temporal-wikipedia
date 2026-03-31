// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 *
 * @typedef {Object} StoreConfig
 * @property {?string} key
 * @property {?string} gid
 *
 * @typedef {StoreConfig | string | null} SimpleConfig
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const util = globalThis.distribution.util;
const storePath = path.join(__dirname, '..', '..', 'store');

const encodeKey = (key) => Buffer.from(key).toString('hex');
const decodeKey = (hex) => Buffer.from(hex, 'hex').toString();

/**
 * @param {any} state
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function put(state, configuration, callback) {
  let group;
  let key;
  if (typeof(configuration) == 'string' || configuration == null) {
    group = 'local';
    key = configuration == null ? util.id.getID(state) : configuration;
  } else {
    if (typeof(configuration) == 'object' && configuration.gid && configuration.key) {
      group = configuration.gid;
      key = configuration == null ? util.id.getID(state) : configuration.key;
    } else {
      return callback(Error('store put must be a SimpleConfig type or string'));
    }
  }
  const filePath = path.join(storePath, `${util.id.getNID(globalThis.distribution.node.config)}/${group}/${encodeKey(key)}.txt`);
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, util.serialize(state));
  return callback(null, state);
}

/**
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function get(configuration, callback) {
  let group;
  let key;
  if (typeof(configuration) == 'string' || configuration == null) {
    group = 'local';
    key = configuration;
  } else {
    if (typeof(configuration) == 'object' && configuration.gid) {
      group = configuration.gid;
      key = configuration.key;
    } else {
      return callback(Error('store get must be a SimpleConfig type or string or null'));
    }
  }
  if (key == null) {
    const dirPath = path.join(storePath, `${util.id.getNID(globalThis.distribution.node.config)}/${group}`);
    if (!fs.existsSync(dirPath)) {
      return callback(null, []);
    }
    return callback(null, fs.readdirSync(dirPath).map((filename) => decodeKey(filename.replace('.txt', ''))));
  } else {
    const filePath = path.join(storePath, `${util.id.getNID(globalThis.distribution.node.config)}/${group}/${encodeKey(key)}.txt`);
    if (!fs.existsSync(filePath)) {
      return callback(Error(`key ${key} does not exist in group ${group}`));
    }
    return callback(null, util.deserialize(fs.readFileSync(filePath, 'utf8')));
  }
}

/**
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function del(configuration, callback) {
  let group;
  let key;
  if (typeof(configuration) == 'string') {
    group = 'local';
    /** @type {string | null} */
    key = configuration;
  } else {
    if (typeof(configuration) == 'object' && configuration.gid && configuration.key) {
      group = configuration.gid;
      key = /** @type {string | null} */ (configuration.key);
    } else {
      return callback(Error('del put must be a SimpleConfig type or string'));
    }
  }
  const filePath = path.join(storePath, `${util.id.getNID(globalThis.distribution.node.config)}/${group}/${encodeKey(key)}.txt`);
  if (!fs.existsSync(filePath)) {
    return callback(Error(`storage: key ${key} does not exist in group ${group}`));
  }
  const oldVal = util.deserialize(fs.readFileSync(filePath, 'utf8'));
  fs.unlinkSync(filePath);
  return callback(null, oldVal);
}

/**
 * @param {any} state
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function append(state, configuration, callback) {
  let group;
  let key;
  if (typeof(configuration) == 'string' || configuration == null) {
    group = 'local';
    key = configuration == null ? util.id.getID(state) : configuration;
  } else {
    if (typeof(configuration) == 'object' && configuration.gid && configuration.key) {
      group = configuration.gid;
      key = configuration.key;
    } else {
      return callback(Error('store append must be a SimpleConfig type or string'));
    }
  }
  const filePath = path.join(storePath, `${util.id.getNID(globalThis.distribution.node.config)}/${group}/${encodeKey(key)}.txt`);
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  let existing = [];
  if (fs.existsSync(filePath)) {
    existing = util.deserialize(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(existing)) {
      existing = [existing];
    }
  }
  existing.push(state);
  fs.writeFileSync(filePath, util.serialize(existing));
  return callback(null, existing);
}

module.exports = {put, get, del, append};
