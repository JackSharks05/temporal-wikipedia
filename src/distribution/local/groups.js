// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 * @typedef {import("../types.js").Node} Node
 */
const { setup } = require("../all/all.js"); //omg it's crazy that this is just a thing... was trying to do it manually and this was a life saver!
const registry = {
  all: {},
};

registry.all[
  globalThis.distribution.util.id.getSID(globalThis.distribution.node.config)
] = globalThis.distribution.node.config;
/**
 * @param {string} name
 * @param {Callback} callback
 */
function get(name, callback) {
  // console.log("[local.groups.get] name =", name, "keys:", Object.keys(registry));
  let output;
  let error = null;
  if (name in registry) {
    output = registry[name];
  } else {
    error = new Error(`Group ${name} does not exist in registry.`);
  }
  if (callback) {
    callback(error, output);
  }
}

/**
 * @param {Config | string} config
 * @param {Object.<string, Node>} group
 * @param {Callback} callback
 */
function put(config, group, callback) {
  let output;
  let name = config;
  let error = null;
  if (typeof config === "string") {
    registry[config] = group;
    output = group;
  } else {
    name = config.gid;
    registry[name] = group;
    output = group;
  }
  if (name !== "all") {
    if (typeof config === "object" && config && typeof config.hash === "function") {
      globalThis.distribution[name] = setup({ gid: name, hash: config.hash });
    } else {
      globalThis.distribution[name] = setup({ gid: name });
    }
  }
  // globalThis.distribution[name] = {};
  // Object.keys(globalThis.distribution.all).forEach((key) => {
  //   const service = globalThis.distribution.all[key];
  //   globalThis.distribution[name][key] = service;
  // });
  if (callback) {
    callback(error, output);
  }
}

/**
 * @param {string} name
 * @param {Callback} callback
 */
function del(name, callback) {
  let output = null;
  let error = null;
  if (name in registry) {
    output = registry[name];
    delete registry[name];
    delete globalThis.distribution[name];
  } else {
    error = new Error(`Group ${name} does not exist in registry.`);
  }
  if (callback) {
    callback(error, output);
  }
}

/**
 * @param {string} name
 * @param {Node} node
 * @param {Callback} callback
 */
function add(name, node, callback) {
  let output = null;
  let error = null;
  if (name in registry) {
    const sid = globalThis.distribution.util.id.getSID(node);
    registry[name][sid] = node;
    output = registry[name];
  } else {
    error = new Error(`Group ${name} does not exist.`);
  }
  if (callback) {
    callback(error, output);
  }
}

/**
 * @param {string} name
 * @param {string} node
 * @param {Callback} callback
 */
function rem(name, node, callback) {
  let output = null;
  let error = null;
  if (name in registry) {
    delete registry[name][node];
    output = node;
  } else {
    error = new Error(`Group ${name} does not exist.`);
  }
  if (callback) {
    callback(error, output);
  }
}

module.exports = { get, put, del, add, rem };
