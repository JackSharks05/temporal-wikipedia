#!/usr/bin/env node

const distribution = require('../distribution');
const {getArg, getPrivateIp} = require('../lib/clusterConnect');

const ip = getArg('--ip', getPrivateIp());
const port = Number(getArg('--port', '8080'));

const dist = distribution({ip, port});

dist.node.start((server) => {
  if (server instanceof Error) {
    console.error('[worker] failed to start:', server.message);
    process.exit(1);
  }
  console.log(`[worker] ready on ${ip}:${port}`);
});
