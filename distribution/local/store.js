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
const fs = require('node:fs');
const path = require('node:path');

/**
 * @param {SimpleConfig} configuration
 * @returns {{key: (string|null), gid: string}}
 */
function parseConfig(configuration) { // normalize
  let key = null;
  let gid = 'local';

  if (typeof configuration === 'string') {
    key = configuration;
  } else if (configuration && typeof configuration === 'object') {
    if (typeof configuration.key === 'string' || configuration.key === null) {
      key = configuration.key;
    }
    if (typeof configuration.gid === 'string' && configuration.gid.length > 0) {
      gid = configuration.gid;
    }
  } else if (configuration === null) {
    key = null;
  }

  return {key, gid};
}

/**
 * @param {string} key
 * @returns {string}
 */
function safeKey(key) {
  const s = String(key).replace(/[^a-z0-9]/gi,'');
  return s;
}

/**
 * @param {string} gid
 * @returns {string}
 */
function getPartition(gid) {
  const dist = globalThis.distribution;
  const nid = dist.util.id.getNID(dist.node.config);

  const root = path.resolve(__dirname,'..','..');
  const base = path.join(root,'store',nid);
  const partition = path.join(base, gid);

  try {
    fs.mkdirSync(partition, {recursive: true});
  } catch (e) {
  }

  return partition;
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

  const util = dist.util;

  let key = config.key;
  if (key === null) {
    key = id.getID(state);
  }

  const filename = safeKey(key);
  const file = path.join(partition,filename);
  const data = util.serialize(state);


  fs.writeFile(file,data,'utf8',(e) => {
    if (e){
      return callback(e, null);
    }
    return callback(null, state);
  });
}
 


/**
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function get(configuration,callback) {

  
  const config = parseConfig(configuration);
  const partition = getPartition(config.gid);
  const dist = globalThis.distribution;
  const util = dist.util;

  if (config.key === null) {
    return fs.readdir(partition,(e,files) => {
      if (e){
        return callback(e,null);
      }
      return callback(null,files);
    });
  }

  const filename = safeKey(config.key);
  const file = path.join(partition,filename);

  fs.readFile(file,'utf8',(e, data) => {
    if (e){
      return callback(new Error('store.get: key not found'),null);
    }
    const v = util.deserialize(data);
    return callback(null,v);
  });
}


/**
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function del(configuration, callback) {


  const cfg = parseConfig(configuration);
  const partition = getPartition(cfg.gid);

  if (cfg.key === null) {
    return callback(new Error('store.del: missing key'),null);
  }


  const dist = globalThis.distribution;
  const util = dist.util;
  const filename = safeKey(cfg.key);
  const file = path.join(partition,filename);

  fs.readFile(file,'utf8',(e,data) => {
    if (e){
      return callback(new Error('store.del: key not found'),null);
    }

    let v = util.deserialize(data);

    fs.unlink(file,(e) => {
      if (e){
        return callback(e,null);
      }
      return callback(null,v);
    });
  });
}

 
/**
 * @param {any} state
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function append(state, configuration, callback) {
  return callback(new Error('store.append not implemented')); // You'll need to implement this method for the distributed processing milestone.
}

module.exports = {put, get, del, append};
