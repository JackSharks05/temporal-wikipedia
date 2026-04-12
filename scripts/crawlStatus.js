#!/usr/bin/env node

const {connectToCluster, shutdown, getArg, parseNodesFile} = require('../lib/clusterConnect');
const os = require('os');
const distribution = require('../distribution');

const PAGE_PREFIX = 'page:';
const crawlGid = 'crawl';

function call(fn) {
  return new Promise((resolve, reject) => {
    fn((err, val) => {
      if (err instanceof Error) return reject(err);
      resolve(val);
    });
  });
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

(async () => {
  const nodesFile = getArg('--nodes-file', null);
  if (!nodesFile) {
    console.error('Usage: node scripts/crawlStatus.js --nodes-file nodes.txt [--coord ip:port]');
    console.error('  --coord   coordinator ip:port (default: auto-detect local IP + :8080)');
    process.exit(1);
  }

  const coordArg = getArg('--coord', null);
  const coordIp = coordArg ? coordArg.split(':')[0] : getPrivateIp();
  const coordPort = coordArg ? Number(coordArg.split(':')[1]) : 8080;

  const localPort = 7998;
  const dist = distribution({ip: coordIp, port: localPort});

  await new Promise((resolve, reject) => {
    dist.node.start((server) => {
      if (server instanceof Error) return reject(server);
      resolve(server);
    });
  });

  try {
    const id = dist.util.id;
    const nodes = parseNodesFile(nodesFile);
    const group = {};

    const coord = {ip: coordIp, port: coordPort};
    group[id.getSID(coord)] = coord;

    for (const node of nodes) {
      group[id.getSID(node)] = node;
    }

    await new Promise((resolve, reject) => {
      dist.local.groups.put(crawlGid, group, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  } catch (err) {
    console.error('Failed to set up group:', err.message);
    process.exit(1);
  }

  try {
    const store = dist[crawlGid].store;
    const keys = await call((cb) => store.get({key: null}, cb));

    const pageKeys = (keys || []).filter((k) => typeof k === 'string' && k.startsWith(PAGE_PREFIX));
    const counts = {total: 0, stored: 0, pending: 0, inflight: 0, failed: 0};
    const storedTitles = [];
    const failedTitles = [];

    for (const key of pageKeys) {
      let val;
      try {
        val = await call((cb) => store.get({key}, cb));
      } catch (e) {
        continue;
      }
      if (!val) continue;
      counts.total++;
      const s = val.status;
      if (counts[s] !== undefined) counts[s]++;

      if (s === 'stored') storedTitles.push(val.title);
      if (s === 'failed') failedTitles.push({title: val.title, err: val.lastError});
    }

    console.log('\n=== Crawl Status ===');
    console.log('Total articles tracked:', counts.total);
    console.log('  Stored (complete):', counts.stored);
    console.log('  Pending:', counts.pending);
    console.log('  In-flight:', counts.inflight);
    console.log('  Failed:', counts.failed);
    console.log('');

    if (storedTitles.length > 0) {
      console.log('Stored articles (' + storedTitles.length + '):');
      storedTitles.sort();
      for (const t of storedTitles) console.log('  ' + t);
    }

    if (failedTitles.length > 0) {
      console.log('\nFailed articles (' + failedTitles.length + '):');
      for (const f of failedTitles) console.log('  ' + f.title + ' -- ' + (f.err || 'unknown'));
    }
  } catch (err) {
    console.error('Error reading crawl state:', err.message || err);
  }

  await shutdown(dist);
  process.exit(0);
})();
