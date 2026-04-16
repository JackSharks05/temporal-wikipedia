#!/usr/bin/env node

const os = require('os');
const distribution = require('../distribution');

// Expose this module's require on the global scope so MR mapper/reducer
// functions (created via `new Function(...)` and therefore lacking module
// context) can still load Node modules and project files on workers.
globalThis.__workerRequire = require;

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i === -1 || i + 1 >= process.argv.length) return fallback;
  return process.argv[i + 1];
}

function getPrivateIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '0.0.0.0';
}

const ip = arg('--ip', getPrivateIp());
const port = Number(arg('--port', '8080'));

const dist = distribution({ip, port});

dist.node.start((server) => {
  if (server instanceof Error) {
    console.error('[worker] failed to start:', server.message);
    process.exit(1);
  }
  console.log(`[worker] ready on ${ip}:${port}`);
});
