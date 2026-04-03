// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Node} Node
 */

/**
 * @param {string} configuration
 * @param {Callback} callback
 */
function get(configuration, callback) {
  const config = globalThis.distribution.node.config;
  const id = globalThis.distribution.util.id;
  let output;
  let error = null;
  switch (configuration) {
    case "nid":
      output = id.getNID(config);
      break;
    case "sid":
      output = id.getSID(config);
      break;
    case "ip":
      output = config.ip;
      break;
    case "port":
      output = config.port;
      break;
    case "counts":
      output = config.counts ?? 0;
      break;
    case "heapTotal":
      if (typeof config.heapTotal !== "number") {
        config.heapTotal = process.memoryUsage().heapTotal;
      }
      output = config.heapTotal;
      break;
    case "heapUsed":
      output = process.memoryUsage().heapUsed;
      break;
    default:
      error = new Error("No configuration specified.");
  }
  if (callback) {
    callback(error, output);
  }
}

/**
 * @param {Node} configuration
 * @param {Callback} callback
 */
function spawn(configuration, callback) {
  callback(new Error("status.spawn not implemented"));
}

/**
 * @param {Callback} callback
 */
function stop(callback) {
  callback(new Error("status.stop not implemented"));
}

module.exports = { get, spawn, stop };
