// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Node} Node
 */

const http = require("node:http");
const { hostname } = require("node:os");

/**
 * @typedef {Object} Target
 * @property {string} service
 * @property {string} method
 * @property {Node} node
 * @property {string} [gid]
 */

/**
 * @param {Array<any>} message
 * @param {Target} remote
 * @param {(error: Error, value?: any) => void} callback
 * @returns {void}
 */
function send(message, remote, callback) {
  let output;
  let error = null;
  if (remote.node == null) {
    callback(new Error("remote.node does not exist!"));
  } else if (remote.node.ip == null) {
    callback(new Error("remote.node.ip does not exist!"));
  } else if (remote.node.port == null) {
    callback(new Error("remote.node.port does not exist!"));
  } else if (
    typeof remote.service !== "string" ||
    remote.service.trim().length <= 0
  ) {
    callback(new Error("remote.service isn't a non-empty string!"));
  } else if (
    typeof remote.method !== "string" ||
    remote.method.trim().length <= 0
  ) {
    callback(new Error("remote.method isn't a non-empty string!"));
  } else if (!Array.isArray(message)) {
    callback(new Error("remote.method isn't a non-empty string!"));
  } else {
    if (remote.gid == null) {
      remote.gid = "local";
    }
    const options = {};
    options.hostname = remote.node.ip;
    options.port = remote.node.port;
    options.path =
      "/" + remote.gid + "/" + remote.service + "/" + remote.method;
    options.method = "PUT";
    options.headers = {
      "Content-Type": "application/json",
    };

    const serializedMessage = globalThis.distribution.util.serialize(message);
    const request = http.request(options, (response) => {
      let data = "";
      response.on("data", (chunk) => {
        data += chunk;
      });
      response.on("end", () => {
        try {
          const decoded = globalThis.distribution.util.deserialize(data);
          callback(decoded[0], decoded[1]);
        } catch (err) {
          callback(err);
        }
      });
    });

    request.on("error", (err) => {
      callback(err);
    });

    request.write(serializedMessage);
    request.end();
  }
}

module.exports = { send };
