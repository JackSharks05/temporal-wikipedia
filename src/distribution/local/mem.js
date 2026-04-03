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

const memoryStore = {};

/**
 * @param {any} state
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function put(state, configuration, callback) {
  let output;
  let error = null;
  // if (configuration == null) {
  //   // console.log(`configuration ${configuration} IS null!`);
  //   configuration = id.getID(state);
  //   // console.log(`new config is ${configuration} IS null!`);
  //   // console.log(`new config is ${id.getID(state)} IS null!`);
  //   memoryStore[id.getID(state)] = state;
  // } else {
  //   memoryStore[configuration] = state;
  //   // console.log(`configuration ${configuration} is not null!`);
  // }
  let name;
  if (configuration === null) {
    name = globalThis.distribution.util.id.getID(state);
  } else if (typeof configuration === "object") {
    name = configuration.key;
  } else {
    name = configuration;
  }
  let gid;
  if (configuration && typeof configuration === "object" && configuration.gid) {
    gid = configuration.gid;
  } else {
    gid = "local";
  }
  const key = `${gid}:${name}`;
  memoryStore[key] = state;
  output = memoryStore[key];
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
  return callback(new Error("mem.append not implemented")); // You'll need to implement this method for the distributed processing milestone.
}

/**
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function get(configuration, callback) {
  let output;
  let error = null;
  let name;
  if (typeof configuration === "object") {
    name = configuration.key;
  } else {
    name = configuration;
  }
  let gid;
  if (configuration && typeof configuration === "object" && configuration.gid) {
    gid = configuration.gid;
  } else {
    gid = "local";
  }
  const key = `${gid}:${name}`;
  if (key in memoryStore) {
    output = memoryStore[key];
  } else {
    // console.log(memoryStore);
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
  let name;
  if (typeof configuration === "object") {
    name = configuration.key;
  } else {
    name = configuration;
  }
  let gid;
  if (configuration && typeof configuration === "object" && configuration.gid) {
    gid = configuration.gid;
  } else {
    gid = "local";
  }
  const key = `${gid}:${name}`;
  if (key in memoryStore) {
    output = memoryStore[key];
    delete memoryStore[key];
  } else {
    error = new Error(`Key ${name} does not exist in registry.`);
  }
  if (callback) {
    callback(error, output);
  }
}

module.exports = { put, get, del, append };
