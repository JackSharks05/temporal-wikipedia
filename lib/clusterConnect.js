const fs = require('fs');
const os = require('os');
const path = require('path');
const distribution = require('../distribution');

function getPrivateIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

function parseNodesFile(filePath) {
  const resolved = path.resolve(filePath);
  const lines = fs.readFileSync(resolved, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  return lines.map((line) => {
    const [ip, portStr] = line.split(':');
    return {ip: ip.trim(), port: Number(portStr.trim())};
  });
}

/**
 * Connect to a distributed cluster.
 */
async function connectToCluster(opts = {}) {
  const nodesFile = opts.nodesFile || null;
  const gid = opts.gid || 'wiki';
  const ip = opts.ip || (nodesFile ? getPrivateIp() : '127.0.0.1');
  const port = opts.port || 7999;
  const propagate = opts.propagate || false;

  const dist = distribution({ip, port});

  await new Promise((resolve, reject) => {
    dist.node.start((server) => {
      if (server instanceof Error) return reject(server);
      resolve(server);
    });
  });

  if (!nodesFile) {
    throw new Error("connecto cluster: no nodes file")
  }
    const nodes = parseNodesFile(nodesFile);
    if (!nodes.length) throw new Error('No nodes found in ' + nodesFile);

    const id = dist.util.id;
    const group = {};
    for (const node of nodes) {
      group[id.getSID(node)] = node;
    }
    await new Promise((resolve, reject) => {
      dist.local.groups.put(gid, group, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

  return dist;
}

function shutdown(dist) {
  return new Promise((resolve) => {
    dist.local.status.stop(() => resolve());
  });
}

function getArg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  if (i === -1 || i + 1 >= process.argv.length) return fallback;
  return process.argv[i + 1];
}

function hasArg(name) {
  return process.argv.includes(name);
}

module.exports = {
  connectToCluster,
  shutdown,
  getPrivateIp,
  parseNodesFile,
  getArg,
  hasArg,
};
