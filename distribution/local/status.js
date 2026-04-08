// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Node} Node
 */

const proc = require('node:child_process');
const path = require('node:path');

/**
 * @param {string} configuration
 * @param {Callback} callback
 */
function get(configuration, callback) {
  
  if (typeof callback !== "function"){
    callback = () => {};
  }
  if (typeof configuration !== "string"){
    configuration = "";
  }

  const distribution = globalThis.distribution;
  const config = distribution.node.config;
  const id = distribution.util.id;

  if (configuration === "nid") return callback(null, id.getNID(config));
  if (configuration === "sid") return callback(null, id.getSID(config));
  if (configuration === "ip") return callback(null, config.ip);
  if (configuration === "port") return callback(null, config.port);
  if (configuration === "counts") return callback(null, distribution.node.counts);
  if (configuration === "heapTotal") return callback(null, process.memoryUsage().heapTotal);
  if (configuration === "heapUsed") return callback(null, process.memoryUsage().heapUsed);

  return callback(new Error("unknown status key: " + configuration), null);
}


/**
 * @param {Node} configuration
 * @param {Callback} callback
 */
function spawn(configuration, callback) {
  if (typeof callback !== 'function') callback = () => {};

  if (!configuration || typeof configuration !== 'object') {
    return callback(new Error('status.spawn: missing config'), null);
  }
  if (typeof configuration.ip !== 'string' || configuration.ip.length === 0) {
    return callback(new Error('status.spawn: missing ip'), null);
  }
  if (typeof configuration.port !== 'number' ||
      !Number.isInteger(configuration.port) ||
      configuration.port <= 0 ||
      configuration.port > 65535) {
    return callback(new Error('status.spawn: invalid port'), null);
  }

  const dist = globalThis.distribution;
  const util = dist.util;
  const nodeInfo = {ip: configuration.ip,port: configuration.port};

  let done = false;
  const finish = (e, v) => {
    if (done) return;
    done = true;
    callback(e || null, v);
  };

  const bootRPC = util.wire.createRPC((e,v) => {
    if (!e) dist.local.groups.add('all', nodeInfo, () => {});
    finish(e,v);
  });

  const userOnStart = (typeof configuration.onStart === 'function') ?
    configuration.onStart : null;

  const parts = [
    'if (server instanceof Error) {',
    '  try{ (' + bootRPC.toString() + ')(server, null); }catch(e){}',
    '  return;',
    '}',
  ];

  if (userOnStart) {
    parts.push('try{ ('+ userOnStart.toString() +')(server); }catch(e){}');
  }

  parts.push(
    'try{ ('+bootRPC.toString() +')(null, '+ JSON.stringify(nodeInfo)+'); }catch(e){}',
  );

  const onStart = Function('return (function(server){'+parts.join('')+'})')();
  const childConfig = Object.assign({}, configuration, {onStart});
  const distPath = path.resolve(__dirname,'..','..','distribution.js');

  
  const child = proc.spawn(process.execPath, [distPath, '--config', util.serialize(childConfig)], { // NEW: Spawn worker nodes with explicit detached options in the merged workspace.
    stdio: ['ignore', 'ignore', 'ignore'], // NEW: Keep the original ignored stdio behavior.
    detached: true, // NEW: Detach the child so the parent test process does not retain it as an active handle.
  }); // NEW: End merged child spawn options.
  child.unref(); // NEW: Release the parent's reference to the spawned worker process to prevent Jest open-handle warnings.
}

/**
 * @param {Callback} callback
 */
function stop(callback) {
  if (typeof callback !== 'function') callback = () => {};

  
  const dist = globalThis.distribution;
  const server = dist.node && dist.node.server;

  if (!server || typeof server.close !== 'function') {
    return callback(new Error('status.stop: server not running'),null);
  }

  try {
    server.close(); // NEW: Revert to the original asynchronous-close behavior so the copied test suite receives its callback immediately.
  } catch (e) {
  }

  return callback(null,dist.node.config);
}

module.exports = {get, spawn, stop};
