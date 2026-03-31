// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Node} Node
 */
const util = require('../util/util.js');
const child_process = require('child_process');
/**
 * @param {string} configuration
 * @param {Callback} callback
 */
let counts = 0;
function get(configuration, callback) {
  const config = globalThis.distribution.node.config;
  const nid = util.id.getNID(config);
  const sid = util.id.getSID(config);
  const commands = {
    nid: nid,
    sid: sid,
    ip: config.ip,
    port: config.port,
    counts: counts,
    heapTotal: process.memoryUsage().heapTotal,
    heapUsed: process.memoryUsage().heapUsed,
  };
  if (configuration in commands) {
    return callback(null, commands[configuration]);
  } else {
    return callback(new Error(`Key ${configuration} not found in status`), null);
  }
};

function incCounts() {
  counts++;
}
/**
 * @param {Node} configuration
 * @param {Callback} callback
 */
function spawn(configuration, callback) {
  if (!configuration || !configuration.port || !configuration.port || configuration.port == 0) {
    return callback(Error('invalid spawn config'));
  }
  distribution.local.groups.get('all', (e, group) => {
    const sid = util.id.getSID(configuration);
    if (group && sid in group) {
      return callback(new Error(`node on ${configuration.port} already exists`));
    }
    const originalOnStart = configuration.onStart;
    const g = originalOnStart ?
      (server) => {
        originalOnStart(server); callback(null, server);
      } :
      (server) => {
        callback(null, server);
      };

    // @ts-ignore
    distribution.local.groups.add('all', configuration, () => {});
    // @ts-ignore
    configuration.onStart = util.wire.createRPC(g);
    const serialized_config = util.serialize(configuration);
    const child = child_process.spawn('./distribution.js', ['--config', serialized_config]);
  });
}

/**
 * @param {Callback} callback
 */
function stop(callback) {
  callback(null, globalThis.distribution.node.config);
  globalThis.distribution.node.server.close();
}

module.exports = {get, spawn, stop, incCounts};
