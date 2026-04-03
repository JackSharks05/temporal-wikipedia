/**
 * @typedef {import("../types").Callback} Callback
 * @typedef {string} ServiceName
 */

const registry = {};
const local = globalThis.distribution.local;
function initialize() {
  registry["status"] = local.status;
  registry["routes"] = local.routes;
  registry["comm"] = local.comm;
}

/**
 * @param {ServiceName | {service: ServiceName, gid?: string}} configuration
 * @param {Callback} callback
 * @returns {void}
 */
function get(configuration, callback) {
  let output;
  let error = null;
  let serviceName;
  let gid;
  if (typeof configuration === "string") {
    serviceName = configuration;
    gid = "local";
  } else {
    serviceName = configuration.service;
    gid = configuration.gid || "local";
  }
  if (gid === "local") {
    if (serviceName in registry) {
      output = registry[serviceName];
    } else if (
      globalThis.toLocal instanceof Map &&
      globalThis.toLocal.has(serviceName)
    ) {
      const fn = globalThis.toLocal.get(serviceName);
      output = {
        call: (...args) => fn(...args),
      };
    } else {
      error = new Error(`Configuration ${configuration} not found.`);
    }
  } else {
    if (gid in globalThis.distribution) {
      if (serviceName in globalThis.distribution[gid]) {
        output = globalThis.distribution[gid][serviceName];
      } else {
        error = new Error(`Service ${serviceName} not found in group ${gid}.`);
      }
    } else {
      error = new Error(`Group ${gid} not found.`);
    }
  }
  if (callback) {
    callback(error, output);
  }
}

/**
 * @param {object} service
 * @param {string} configuration
 * @param {Callback} callback
 * @returns {void}
 */
function put(service, configuration, callback) {
  let output;
  let error = null;
  if (typeof configuration === "string") {
    registry[configuration] = service;
    output = service; //not sure what to do with the output
  } else {
    error = new Error("Invalid configuration name.");
  }
  if (callback) {
    callback(error, output);
  }
}

/**
 * @param {string} configuration
 * @param {Callback} callback
 */
function rem(configuration, callback) {
  let output;
  let error = null;
  const serviceName =
    typeof configuration === "string" ? configuration : configuration.service;
  if (serviceName in registry) {
    output = registry[serviceName];
    delete registry[serviceName];
  } else {
    error = new Error("Configuration not found.");
  }
  if (callback) {
    callback(error, output);
  }
}

module.exports = { get, put, rem };
