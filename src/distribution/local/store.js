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
const fs = require("node:fs");
const path = require("node:path");
const STORE_DIR = path.resolve(__dirname, "..", "..", "..", "store");
const KEY_INDEX_KEY = "__keys__";

function getGid(configuration) {
  if (configuration && typeof configuration === "object" && configuration.gid) {
    return configuration.gid;
  }
  return "local";
}

function getNameFromConfig(state, configuration) {
  if (configuration === null) {
    return globalThis.distribution.util.id.getID(state);
  }
  if (typeof configuration === "object") {
    return configuration.key;
  }
  return configuration;
}

function getFileId(gid, name) {
  return globalThis.distribution.util.id.getID(`${gid}:${name}`);
}

function getNodeSID() {
  return globalThis.distribution.util.id.getSID(
    globalThis.distribution.node.config,
  );
}

function getIndexPath(gid) {
  return path.join(
    STORE_DIR,
    `${getFileId(gid, `${KEY_INDEX_KEY}:${getNodeSID()}`)}.txt`,
  );
}

function readKeyIndex(gid) {
  try {
    const raw = fs.readFileSync(getIndexPath(gid), "utf8");
    const parsed = globalThis.distribution.util.deserialize(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function writeKeyIndex(gid, keys) {
  fs.writeFileSync(
    getIndexPath(gid),
    globalThis.distribution.util.serialize(keys),
    "utf8",
  );
}

function trackKey(gid, key) {
  if (!(typeof key === "string" && key.length > 0)) {
    return;
  }
  const keys = readKeyIndex(gid);
  if (!keys.includes(key)) {
    keys.push(key);
    writeKeyIndex(gid, keys);
  }
}

function untrackKey(gid, key) {
  if (!(typeof key === "string" && key.length > 0)) {
    return;
  }
  const keys = readKeyIndex(gid).filter((k) => k !== key);
  writeKeyIndex(gid, keys);
}

/**
 * @param {any} state
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function put(state, configuration, callback) {
  let output;
  let error = null;
  const name = getNameFromConfig(state, configuration);
  const gid = getGid(configuration);
  const fileId = getFileId(gid, name);
  try {
    fs.mkdirSync(STORE_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(STORE_DIR, `${fileId}.txt`),
      globalThis.distribution.util.serialize(state),
      "utf8",
    );
    trackKey(gid, name);
  } catch (err) {
    error = new Error(`Key ${name} does not exist in registry.`);
  }
  output = state;
  if (callback) {
    callback(error, output);
  }
}

/**
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function get(configuration, callback) {
  let output;
  let error = null;
  const gid = getGid(configuration);
  if (
    configuration === null ||
    (configuration &&
      typeof configuration === "object" &&
      (configuration.key === null || configuration.key === undefined))
  ) {
    if (callback) {
      callback(null, readKeyIndex(gid));
    }
    return;
  }
  const name = getNameFromConfig(undefined, configuration);
  const fileId = getFileId(gid, name);
  try {
    output = globalThis.distribution.util.deserialize(
      fs.readFileSync(path.join(STORE_DIR, `${fileId}.txt`), "utf8"),
    );
  } catch (err) {
    error = new Error(`Key ${name} does not exist in registry.`);
  }
  if (callback) {
    callback(error, output);
  }
}

/**
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function del(configuration, callback) {
  let output;
  let error = null;
  const name = getNameFromConfig(undefined, configuration);
  const gid = getGid(configuration);
  const fileId = getFileId(gid, name);
  try {
    output = globalThis.distribution.util.deserialize(
      fs.readFileSync(path.join(STORE_DIR, `${fileId}.txt`), "utf8"),
    );
    fs.unlinkSync(path.join(STORE_DIR, `${fileId}.txt`));
    untrackKey(gid, name);
  } catch (err) {
    error = new Error(`Key ${name} does not exist in registry.`);
  }
  if (callback) {
    callback(error, output);
  }
}

/**
 * @param {any} state
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function append(state, configuration, callback) {
  let output;
  let error = null;

  if (configuration == null) {
    error = new Error(`Configuration ${configuration} invalid`);
    if (callback) {
      callback(error, output);
    }
    return;
  }

  const key = getNameFromConfig(state, configuration);
  if (!(typeof key === "string" && key.length > 0)) {
    error = new Error(`Configuration ${configuration} invalid`);
    if (callback) {
      callback(error, output);
    }
    return;
  }

  const gid = getGid(configuration);
  const fileId = getFileId(gid, key);
  let existing = [];

  try {
    fs.mkdirSync(STORE_DIR, { recursive: true });
    const filePath = path.join(STORE_DIR, `${fileId}.txt`);

    try {
      const raw = fs.readFileSync(filePath, "utf8");
      existing = globalThis.distribution.util.deserialize(raw);
    } catch (readErr) {
      if (!(readErr && readErr.code === "ENOENT")) {
        throw readErr;
      }
      existing = [];
    }

    if (!Array.isArray(existing)) {
      existing = [existing];
    }
    existing.push(state);

    fs.writeFileSync(
      filePath,
      globalThis.distribution.util.serialize(existing),
      "utf8",
    );
    trackKey(gid, key);
    output = existing;
  } catch (err) {
    error = err;
  }

  if (callback) {
    callback(error, output);
  }
}

module.exports = { put, get, del, append };
