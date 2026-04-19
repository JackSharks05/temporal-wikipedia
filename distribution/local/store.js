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

/* Notes/Tips:

- Use absolute paths to make sure they are agnostic to where your code is running from!
  Use the `path` module for that.
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { allowedNodeEnvironmentFlags } = require("process");
const { parse, config } = require("yargs");

/**
 * get storage dir for the current node 
 * @param {string} gid
 * @returns {string}
 */
function getStoreDir(gid) {
  const nid = globalThis.distribution.util.id.getNID(
    globalThis.distribution.node.config,
  )
  const storeRoot = path.join(__dirname, '..', '..', 'store');
  return path.join(storeRoot, nid, gid);
}

/**
 * convert a key to a safe filename
 * @param {string} key
 * @returns {string}
 */
function keyToFilename(key) {
  const hash = crypto.createHash('sha256');
  hash.update(key);
  return hash.digest('hex');
}

/**
 * directory checker
 * @param {string} dir
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {recursive: true});
  }
}

/**
 * parse helper 
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
  try {
    const {key: rawKey, gid} = parseConfig(configuration);
    const key = rawKey === null ? generateKey(state) : rawKey;
    const storeDir = getStoreDir(gid);
    ensureDir(storeDir);
    const filename = keyToFilename(key);
    const filepath = path.join(storeDir, filename);

    const data = {
      key: key,
      value: state,
    };
    const serialized = globalThis.distribution.util.serialize(data);
    fs.writeFileSync(filepath, serialized, 'utf8');
    return callback(null, state);
  } catch (err) {
    return callback(err instanceof Error ? err : new Error(String(err)));
  }
}

/**
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function get(configuration, callback) {
  callback = callback || function() {};
  try {
    const {key, gid} = parseConfig(configuration);
    const storeDir = getStoreDir(gid);
    if (key === null) {
      if (!fs.existsSync(storeDir)) {
        return callback(null, []);
      }

      const files = fs.readdirSync(storeDir);
      const keys = [];
      for (const file of files) {
        const filepath = path.join(storeDir, file);
        try {
          const content = fs.readFileSync(filepath, 'utf8');
          const data = globalThis.distribution.util.deserialize(content);
          keys.push(data.key);
        } catch (e) {
          // skip
        }
      }
      return callback(null, keys);
    }

    const filename = keyToFilename(key);
    const filepath = path.join(storeDir, filename);
    if (!fs.existsSync(filepath)) {
      return callback(new Error('Key not found: ' + key));
    }
    const content = fs.readFileSync(filepath, 'utf8');
    const data = globalThis.distribution.util.deserialize(content);
    return callback(null, data.value);
  } catch (err) {
    return callback(err instanceof Error ? err : new Error(String(err)));
  }
  // return callback(new Error('store.get not implemented'));
}

/**
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function del(configuration, callback) {
  callback = callback || function() {};
  try {
    const {key, gid} = parseConfig(configuration);
    if (key === null) {
      return callback(new Error('Key required for delete'));
    }

    const storeDir = getStoreDir(gid);
    const filename = keyToFilename(key);
    const filepath = path.join(storeDir, filename);

    if (!fs.existsSync(filepath)) {
      return callback(new Error('Key not found: ' + key));
    }

    const content = fs.readFileSync(filepath, 'utf8');
    const data = globalThis.distribution.util.deserialize(content);
    fs.unlinkSync(filepath);
    return callback(null, data.value);
  } catch (err) {
    return callback(err instanceof Error ? err : new Error(String(err)));
  }
  // return callback(new Error('store.del not implemented'));
}

/**
 * @param {any} state
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function append(state, configuration, callback) {
  // return callback(new Error('store.append not implemented')); // You'll need to implement this method for the distributed processing milestone.
  callback = callback || function() {};
  try {
    const {key: rawKey, gid} = parseConfig(configuration);
    if (rawKey === null) {
      return callback(new Error('Key required fro append'));
    }

    const storeDir = getStoreDir(gid);
    ensureDir(storeDir);

    const filename = keyToFilename(rawKey);
    const filepath = path.join(storeDir, filename);

    let existing = [];
    if (fs.existsSync(filepath)) {
      const content = fs.readFileSync(filepath, 'utf8');
      const data = globalThis.distribution.util.deserialize(content);
      if (Array.isArray(data.value)) {
        existing = data.value;
      } else {
        existing = [data.value];
      }
    }
    existing.push(state);
    const data = {
      key: rawKey,
      value: existing,
    };

    const serialized = globalThis.distribution.util.serialize(data);
    fs.writeFileSync(filepath, serialized, 'utf8');
    return callback(null, existing);
  } catch (err) {
    return callback(err instanceof Error ? err : new Error(String(err)));
  }
}

/**
 * @param {any[]} states
 * @param {SimpleConfig[]} configurations
 * @param {Callback} callback
 */
function putBatch(states, configurations, callback) {
  callback = callback || function() {};
  if (!Array.isArray(states) || !Array.isArray(configurations) ||
      states.length !== configurations.length) {
    return callback(new Error('store.putBatch: states and configurations must be parallel arrays'));
  }

  try {
    let written = 0;
    for (let i = 0; i < states.length; i++) {
      const {key: rawKey, gid} = parseConfig(configurations[i]);
      const key = rawKey === null ? generateKey(states[i]) : rawKey;
      const storeDir = getStoreDir(gid);
      ensureDir(storeDir);
      const filepath = path.join(storeDir, keyToFilename(key));
      const serialized = globalThis.distribution.util.serialize({key, value: states[i]});
      fs.writeFileSync(filepath, serialized, 'utf8');
      written++;
    }
    return callback(null, {written});
  } catch (err) {
    return callback(err instanceof Error ? err : new Error(String(err)));
  }
}

/**
 *
 * @param {any[]} states
 * @param {SimpleConfig[]} configurations
 * @param {Callback} callback
 */
function appendBatch(states, configurations, callback) {
  callback = callback || function() {};
  if (!Array.isArray(states) || !Array.isArray(configurations) ||
      states.length !== configurations.length) {
    return callback(new Error('store.appendBatch: states and configurations must be parallel arrays'));
  }

  try {
    const grouped = Object.create(null);
    for (let i = 0; i < states.length; i++) {
      const {key, gid} = parseConfig(configurations[i]);
      if (key === null) {
        return callback(new Error('store.appendBatch: missing key at index ' + i));
      }
      const k = gid + '\0' + key;
      if (!grouped[k]) grouped[k] = {gid, key, values: []};
      grouped[k].values.push(states[i]);
    }

    let appended = 0;
    for (const {gid, key, values} of Object.values(grouped)) {
      const storeDir = getStoreDir(gid);
      ensureDir(storeDir);
      const filepath = path.join(storeDir, keyToFilename(key));

      let existing = [];
      if (fs.existsSync(filepath)) {
        const content = fs.readFileSync(filepath, 'utf8');
        const data = globalThis.distribution.util.deserialize(content);
        existing = Array.isArray(data.value) ? data.value : [data.value];
      }
      for (const v of values) existing.push(v);
      const serialized = globalThis.distribution.util.serialize({key, value: existing});
      fs.writeFileSync(filepath, serialized, 'utf8');
      appended += values.length;
    }
    return callback(null, {appended});
  } catch (err) {
    return callback(err instanceof Error ? err : new Error(String(err)));
  }
}

module.exports = {put, get, del, append, putBatch, appendBatch};
