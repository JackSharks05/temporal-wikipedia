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




const table = Object.create(null);//gid->(key->value)

/**
 * @param {SimpleConfig} configuration
 * @returns {{key: (string|null), gid: string}}
 */
function parseConfig(configuration) {//normalize
  let key = null;
  let gid = 'local';

  if (typeof configuration==='string') {
    key = configuration;
  } 
  else if (configuration && typeof configuration==='object') {
    if (typeof configuration.key==='string'||configuration.key===null) {
      key = configuration.key;
    }
    if (typeof configuration.gid==='string'&& configuration.gid.length > 0) {
      gid = configuration.gid;
    }
  } 
  else if (configuration === null) {
    key =null;
  }

  return {key, gid};
}

/**
 * @param {string} gid
 * @returns {Object.<string, any>}
 */
function getPartition(gid) {
  if (!table[gid]) {
    table[gid] = Object.create(null);
  }
  return table[gid];
}


/**
 * @param {any} state
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function put(state, configuration, callback) {

  const dist = globalThis.distribution;
  const id = dist.util.id;
  const config = parseConfig(configuration);
  const partition = getPartition(config.gid);

  let key = config.key;
  if (key === null) {
    key = id.getID(state);
  }


  partition[key] = state;
  return callback(null,state);
}

/**
 * @param {any} state
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function append(state, configuration, callback) {
  const config = parseConfig(configuration);
  const partition = getPartition(config.gid);

  if (config.key === null) {
    return callback(new Error('mem.append: missing key'),null);
  }

  if (!(config.key in partition)) {
    partition[config.key] = [state];
    return callback(null,partition[config.key]);
  }

  if (!Array.isArray(partition[config.key])) {
    partition[config.key] = [partition[config.key]];
  }

  
  partition[config.key].push(state);
  return callback(null,partition[config.key]);
};

/**
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function get(configuration, callback) {


  const config = parseConfig(configuration);
  const partition = getPartition(config.gid);

  if (config.key === null) {
    return callback(null,Object.keys(partition));
  }

  if (!(config.key in partition)) {
    return callback(new Error('mem.get: key not found'),null);
  }
  return callback(null,partition[config.key]);
}

/**
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function del(configuration, callback) {


  const config = parseConfig(configuration);
  const partition = getPartition(config.gid);

  if (config.key === null) {
    return callback(new Error('mem.del: missing key'),null);
  }

  if (!(config.key in partition)) {
    return callback(new Error('mem.del: key not found'),null);
  }

  const v = partition[config.key];
  delete partition[config.key];
  return callback(null,v);
}

module.exports = {put, get, del, append};
