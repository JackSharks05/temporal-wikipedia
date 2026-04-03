// @ts-check
/**
 * @typedef {import("../types.js").Node} Node
 * @typedef {import("../types.js").Callback} Callback
 */
const http = require('node:http');
const url = require('node:url');
const log = require('../util/log.js');

const yargs = require('yargs/yargs');
const path = require("node:path");

/**
 * @returns {Node}
 */
function setNodeConfig() {
  const args = yargs(process.argv)
      .help(false)
      .version(false)
      .parse();

  let maybeIp; let maybePort; let maybeOnStart;
  if (typeof args.ip === 'string') {
    maybeIp = args.ip;
  }
  if (typeof args.port === 'string' || typeof args.port === 'number') {
    maybePort = parseInt(String(args.port), 10);
  }

  if (args.help === true || args.h === true) {
    console.log('Node usage:');
    console.log('  --ip <ip address>      The ip address to bind the node to');
    console.log('  --port <port>          The port to bind the node to');
    console.log('  --config <config>      The serialized config string');
    process.exit(0);
  }

  if (typeof args.config === 'string') {
    let config = undefined;
    try {
      config = globalThis.distribution.util.deserialize(args.config);
    } catch (error) {
      try {
        config = JSON.parse(args.config);
      } catch {
        console.error('Cannot deserialize config string: ' + args.config);
        process.exit(1);
      }
    }

    if (typeof config?.ip === 'string') {
      maybeIp = config?.ip;
    }
    if (typeof config?.port === 'number') {
      maybePort = config?.port;
    }
    if (typeof config?.onStart === 'function') {
      maybeOnStart = config?.onStart;
    }
  }

  // Default values for config
  maybeIp = maybeIp ?? '127.0.0.1';
  maybePort = maybePort ?? 1234;

  return {
    ip: maybeIp,
    port: maybePort,
    onStart: maybeOnStart,
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
    /* Your server will be listening for PUT requests. */

    // Write some code...
    // accept PUT 
    if (req.method !== 'PUT') {
      const errorResponse = globalThis.distribution.util.serialize(
        new Error('Only PUT requests are suppored'),
      );
      res.end(errorResponse);
      return;
    }


    /*
      The path of the http request will determine the service to be used.
      The url will have the form: http://node_ip:node_port/service/method
    */

    // Write some code...
    // parse URL
    const parsedUrl = url.parse(req.url || '');
    const pathParts = (parsedUrl.pathname || '').split('/').filter((p) => p);

    if (pathParts.length < 3) {
      const errorResponse = globalThis.distribution.util.serialize([
        new Error('Invalid path format. Expected: /<gid>/<service>/<method>'),
        null,
      ]);
      res.end(errorResponse);
      return;
    }
    const gid = pathParts[0];
    const serviceName = pathParts[1];
    const methodName = pathParts[2];


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
    const body = [];

    req.on('data', (chunk) => {
      body.push(chunk);
    });

    req.on('end', () => {

      /*
        Here, you can handle the service requests.
        Use the local routes service to get the service you need to call.
        You need to call the service with the method and arguments provided in the request.
        Then, you need to serialize the result and send it back to the caller.
      */

      // Write some code...
      const status = require('./status.js');
      status.incrementCount();
      const bodyString = Buffer.concat(body).toString();
      let args;
      try {
        args = globalThis.distribution.util.deserialize(bodyString);
      } catch (err) {
        const errorResponse = globalThis.distribution.util.serialize([
          new Error('Failed to deserialize request body'),
          null,
        ]);
        res.end(errorResponse);
        return;
      }
      const routes = require('./routes.js');
      routes.get({service: serviceName, gid: gid}, (routeErr, service) => {
        if (routeErr || !service) {
          const errorResponse = globalThis.distribution.util.serialize([
            routeErr || new Error('Service not found: ' + serviceName),
            null,
          ]);
          res.end(errorResponse);
          return;
        }

        if (typeof service[methodName] !== 'function') {
          const errorResponse = globalThis.distribution.util.serialize([
            new Error('Method not found: ' + methodName),
            null,
          ]);
          res.end(errorResponse);
          return;
        }

        const responseCallback = (err, value) => {
          const response = globalThis.distribution.util.serialize([err, value]);
          res.end(response);
        };

        try {
          if (Array.isArray(args)) {
            service[methodName](...args, responseCallback);
          } else {
            service[methodName](args, responseCallback);
          }
        } catch (err) {
          const errorResponse = globalThis.distribution.util.serialize([
            err instanceof Error ? err : new Error(String(err)),
            null,
          ]);
          res.end(errorResponse);
        }
      });
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

  server.once('listening', () => {
    callback(null);
  });

  server.once('error', (error) => {
    callback(error);
  });

  server.listen(config.port, config.ip);
}

module.exports = {start, config: setNodeConfig()};
