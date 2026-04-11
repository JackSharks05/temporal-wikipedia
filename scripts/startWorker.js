#!/usr/bin/env node

const distribution = require('../distribution');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i === -1 || i + 1 >= process.argv.length) return fallback;
  return process.argv[i + 1];
}

const ip = arg('--ip', '0.0.0.0');
const port = Number(arg('--port', '9001'));

const dist = distribution({ip, port});

dist.node.start((server) => {
  if (server instanceof Error) {
    console.error('[worker] failed to start:', server.message);
    process.exit(1);
  }
  console.log(`[worker] ready on ${ip}:${port}`);
});
