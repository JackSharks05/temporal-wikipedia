#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const distribution = require('../distribution');
const {setup: setupGroup} = require('../distribution/all/all');
const {
  getArticleManifest,
  getPageIdForTitle,
} = require('./wikiStore');

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

function hasArg(name) {
  return process.argv.includes(name);
}

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

const lookup = process.argv[2];
if (!lookup || lookup.startsWith('--')) {
  console.log('Usage: node storage/checkStoredArticle.js <title-or-pageId> [options]');
  console.log('');
  console.log('Options:');
  console.log('  --title              treat argument as article title (default)');
  console.log('  --page-id            treat argument as numeric page ID');
  console.log('  --nodes-file FILE    connect to cluster nodes (same file as runCrawl.js)');
  console.log('  --gid GID            store group (default: wiki)');
  console.log('  --port PORT          local port for this node (default: 7999)');
  console.log('  --ip IP              local IP (auto-detected if --nodes-file is set)');
  process.exit(1);
}

const nodesFile = getArg('--nodes-file', null);
const gid = getArg('--gid', 'wiki');
const isPageId = hasArg('--page-id');
const explicitIp = getArg('--ip', null);
const ip = explicitIp || (nodesFile ? getPrivateIp() : '127.0.0.1');
const port = parseInt(getArg('--port', '7999'), 10);

const dist = distribution({ip, port});

function finish(code) {
  dist.local.status.stop(() => process.exit(code));
}

function call(fn) {
  return new Promise((resolve, reject) => {
    fn((err, val) => {
      if (err && err instanceof Error) return reject(err);
      if (err && typeof err === 'object' && Object.keys(err).length) {
        const first = Object.values(err).find((e) => e);
        return reject(first instanceof Error ? first : new Error(String(first)));
      }
      resolve(val);
    });
  });
}

async function joinCluster(nodes) {
  const id = dist.util.id;
  const wikiGroup = {};

  for (const node of nodes) {
    wikiGroup[id.getSID(node)] = node;
  }

  // Only cluster nodes go in the wiki group (preserves the hash ring)
  await call((cb) => dist.local.groups.put(gid, wikiGroup, cb));
  dist[gid] = setupGroup({gid});
}

function setupLocalGroup() {
  dist.local.groups.put(gid, {[dist.util.id.getSID({ip, port})]: {ip, port}}, () => {});
  dist[gid] = setupGroup({gid});
}

function inspectPage(pageId) {
  getArticleManifest(gid, pageId, (err, manifest) => {
    if (err) {
      console.error('Error:', err.message || err);
      return finish(1);
    }
    console.log(JSON.stringify(manifest, null, 2));
    finish(0);
  });
}

dist.node.start(async (server) => {
  if (server instanceof Error) {
    console.error(server);
    return finish(1);
  }

  if (nodesFile) {
    const nodes = parseNodesFile(nodesFile);
    if (!nodes.length) {
      console.error('No nodes found in ' + nodesFile);
      return finish(1);
    }
    await joinCluster(nodes);
  } else {
    setupLocalGroup();
  }

  if (isPageId) return inspectPage(lookup);

  getPageIdForTitle(gid, lookup, (err, titleRecord) => {
    if (err) {
      console.error('Error:', err.message || err);
      return finish(1);
    }
    console.log('Found pageId:', titleRecord.pageId, 'for title:', titleRecord.title);
    inspectPage(titleRecord.pageId);
  });
});
