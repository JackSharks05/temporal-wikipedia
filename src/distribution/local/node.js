// @ts-check
/**
 * @typedef {import("../types.js").Node} Node
 * @typedef {import("../types.js").Callback} Callback
 */
const http = require("node:http");
const url = require("node:url");
const log = require("../util/log.js");

const yargs = require("yargs/yargs");

/**
 * @returns {Node}
 */
function setNodeConfig() {
  const args = yargs(process.argv).help(false).version(false).parse();

  let maybeIp;
  let maybePort;
  let maybeOnStart;
  if (typeof args.ip === "string") {
    maybeIp = args.ip;
  }
  if (typeof args.port === "string" || typeof args.port === "number") {
    maybePort = parseInt(String(args.port), 10);
  }

  if (args.help === true || args.h === true) {
    console.log("Node usage:");
    console.log("  --ip <ip address>      The ip address to bind the node to");
    console.log("  --port <port>          The port to bind the node to");
    console.log("  --config <config>      The serialized config string");
    process.exit(0);
  }

  if (typeof args.config === "string") {
    let config = undefined;
    try {
      config = globalThis.distribution.util.deserialize(args.config);
    } catch (error) {
      try {
        config = JSON.parse(args.config);
      } catch {
        console.error("Cannot deserialize config string: " + args.config);
        process.exit(1);
      }
    }

    if (typeof config?.ip === "string") {
      maybeIp = config?.ip;
    }
    if (typeof config?.port === "number") {
      maybePort = config?.port;
    }
    if (typeof config?.onStart === "function") {
      maybeOnStart = config?.onStart;
    }
  }

  // Default values for config
  maybeIp = maybeIp ?? "127.0.0.1";
  maybePort = maybePort ?? 1234;

  return {
    ip: maybeIp,
    port: maybePort,
    onStart: maybeOnStart,
    counts: 0,
  };
}
/*
    The start function will be called to start your node.
    It will take a callback as an argument.
    After your node has booted, you should call the callback.
*/

/**
 * @param {(err?: Error | null) => void} callback
 * @returns {void}
 */
function start(callback) {
  const server = http.createServer((req, res) => {
    globalThis.distribution.node.config.counts++; //the counter for messages
    /* Your server will be listening for PUT requests. */
    // Write some code...
    if (req.method !== "PUT") {
      const e = new Error("Only PUT requests allowed.");
      const se = globalThis.distribution.util.serialize(e);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(se);
      return;
    }
    /*
    The path of the http request will determine the service to be used.
    The url will have the form: http://node_ip:node_port/service/method
    */

    // Write some code...
    let parsed;
    try {
      parsed = new URL(req.url, `http://${req.headers.host}`);
    } catch (e) {
      const se = globalThis.distribution.util.serialize([e, null]);
      res.end(se);
      return;
    }
    const parts = parsed.pathname.split("/").filter((p) => p.length > 0);

    if (parts.length !== 3) {
      const e = new Error(
        "Invalid path format: please use /<gid>/<service>/<method>.",
      );
      const se = globalThis.distribution.util.serialize([e, null]);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(se);
      return;
    }
    const gid = parts[0];
    const serviceName = parts[1];
    const methodName = parts[2];
    /*
      A common pattern in handling HTTP requests in Node.js is to have a
      subroutine that collects all the data chunks belonging to the same
      request. These chunks are aggregated into a body variable.

      When the req.on('end') event is emitted, it signifies that all data from
      the request has been received. Typically, this data is in the form of a
      string. To work with this data in a structured format, it is often parsed
      into a JSON object using JSON.parse(body), provided the data is in JSON
      format.

      Our nodes expect data in JSON format.
    */

    // Write some code...

    /** @type {any[]} */
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", () => {
      /*
        Here, you can handle the service requests.
        Use the local routes service to get the service you need to call.
        You need to call the service with the method and arguments provided in the request.
        Then, you need to serialize the result and send it back to the caller.
      */
      // Write some code...
      try {
        const decoded = globalThis.distribution.util.deserialize(body);
        globalThis.distribution.local.routes.get(
          { service: serviceName, gid: gid },
          (e, service) => {
            if (e) {
              const se = globalThis.distribution.util.serialize([e, null]);
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(se);
              return;
            }

            if (!service || typeof service[methodName] !== "function") {
              const e = new Error(
                `Oops! Method ${methodName} not found on service ${serviceName}!`,
              );
              const se = globalThis.distribution.util.serialize([e, null]);
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(se);
              return;
            }

            service[methodName](...decoded, (e, o) => {
              const seo = globalThis.distribution.util.serialize([e, o]);
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(seo);
            });
          },
        );
      } catch (e) {
        const se = globalThis.distribution.util.serialize([e, null]);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(se);
      }
    });
  });

  /*
    Your server will be listening on the port and ip specified in the config
    You'll be calling the `callback` callback when your server has successfully
    started.

    At some point, we'll be adding the ability to stop a node
    remotely through the service interface.
  */

  // Important: allow tests to access server
  globalThis.distribution.node.server = server;
  const config = globalThis.distribution.node.config;

  server.once("listening", () => {
    callback(null);
  });

  server.once("error", (error) => {
    callback(error);
  });

  server.listen(config.port, config.ip);
  globalThis.distribution.node.server = server;

  if (config.onStart) {
    config.onStart(server);
  }
}

module.exports = { start, config: setNodeConfig() };
