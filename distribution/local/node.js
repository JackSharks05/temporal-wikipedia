
// @ts-check
/**
 * @typedef {import("../types.js").Node} Node
 * @typedef {import("../types.js").Callback} Callback
 */
const http = require('node:http');
const url = require('node:url');
const log = require('../util/log.js');

const yargs = require('yargs/yargs');

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
 * @param {(arg?: (Error | null | import('node:http').Server)) => void} callback
 * @returns {void}
 */
function start(callback) {
  const server = http.createServer((req, res) => {
    const util = globalThis.distribution.util;

    function respond(error, value) {
      if (value === undefined) value = null;
      res.end(util.serialize([error || null, value]));
    }

    if (req.method !== 'PUT') {
      const err = new Error('Only PUT supported');
      res.end(util.serialize(err));
      return;
    }

    if (globalThis.distribution.node.counts == null) {
      globalThis.distribution.node.counts = 0;
    }
    globalThis.distribution.node.counts += 1;

    // /<gid>/<service>/<method>
    const parts = (req.url || '').split('/');

    /** @type {any[]} */
    const body = [];

    req.on('data', (chunk) => {
      body.push(chunk);
    });

    req.on('end', () => {
      let args;
      try {
        const raw = body.join('');
        args = util.deserialize(raw);
      } catch (err) {
        return respond(err instanceof Error ? err : new Error(String(err)), null);
      }


      if (!Array.isArray(args)) {
        return respond(new Error('Request body must be an array'), null);
      }

      globalThis.distribution.local.routes.get({service: parts[2],gid: parts[1]},(e,svc) => {
          if (e || !svc) {
            return respond(e || new Error('routes.get: not found'), null);
          }

          const func = svc[parts[3]];
          if (typeof func !== 'function') {
            return respond(new Error('method not found'), null);
          }

          const fullArgs = args.slice();
          fullArgs.push((error, value) => respond(error, value));

          try {
            func.apply(null, fullArgs);
          } catch (err) {
            return respond(err instanceof Error ? err : new Error(String(err)), null);
          }
        },
      );
    });
  });

  
  globalThis.distribution.node.server = server;
  const config = globalThis.distribution.node.config;

  server.once('listening', () => {
    const cfg = globalThis.distribution.node.config;

    if (cfg && typeof cfg.onStart === 'function' && callback === cfg.onStart) {
      return callback(server);
    }
    return callback(null);
  });

  server.once('error', (error) => {
    callback(error);
  });

  server.listen(config.port, config.ip);
}


module.exports = {start, config: setNodeConfig(), counts: 0};
