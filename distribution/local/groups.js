// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 * @typedef {import("../types.js").Node} Node
 */

const all = require('../all/all.js');

const table = Object.create(null); //gid -> { sid -> node }


function ensureBuiltins() {//lazy
  const dist = globalThis.distribution;
  if (!dist || !dist.node || !dist.node.config) return;

  const localNode = dist.node.config;
  const sid = dist.util.id.getSID(localNode);

  if (!table.local) table.local = Object.create(null);
  table.local[sid] = localNode;

  if (!table.all) table.all = Object.create(null);
  table.all[sid] = localNode;
}

/**
 * @param {string} name
 * @param {Callback} callback
 */
function get(name, callback) {
  if (typeof callback !== 'function'){
    callback = () => {};
  }
  ensureBuiltins();

  const g = table[name];
  if (!g){
    return callback(new Error('groups.get: not found'),null);
  }
  return callback(null,g);
}

/**
 * @param {Config | string} config
 * @param {Object.<string, Node>} group
 * @param {Callback} callback
 */
function put(config, group, callback) {
  if (typeof callback !== 'function') callback = () => {};
  ensureBuiltins();
  
  let name;
  if (typeof config === 'string') {
    name = config;
  } else if (config && typeof config === 'object') {
    name = config.gid;
  } else {
    name = undefined;
  }

  if (typeof name !== 'string' || name.length === 0) {
    return callback(new Error('groups.put: missing name'), null);
  }

  /** @type {any} */
  let instConfig;
  if (config && typeof config === 'object') {
    instConfig = Object.assign({}, config, {gid: name});
  } else {
    instConfig = {gid: name};
  }

  table[name] = group;

  if (globalThis.distribution) {
    globalThis.distribution[name] = all.setup(instConfig);
  }

  return callback(null, group);
}

/**
 * @param {string} name
 * @param {Callback} callback
 */
function del(name, callback) {
  if (typeof callback !== 'function') callback = () => {};
  ensureBuiltins();

  const g = table[name];
  if (!g) return callback(new Error('groups.del: not found'),null);

  delete table[name];

  if (globalThis.distribution) {
    delete globalThis.distribution[name];
  }

  return callback(null,g);
}

/**
 * @param {string} name
 * @param {Node} node
 * @param {Callback} callback
 */
function add(name, node, callback) {
  if (typeof callback !== 'function') callback = () => {};
  ensureBuiltins();

  const g = table[name];
  if (!g) return callback(new Error('groups.add: missing group'),null);


  const sid = globalThis.distribution.util.id.getSID(node);
  g[sid] = node;
  return callback(null,g);
};

/**
 * @param {string} name
 * @param {string} node
 * @param {Callback} callback
 */
function rem(name, node, callback) {
  if (typeof callback !== 'function') callback = () => {};
  ensureBuiltins();

  const g = table[name];
  if (!g) return callback(new Error('groups.rem: missing group'),null);


  delete g[node];
  return callback(null,g);
};

module.exports = {get, put, del, add, rem};