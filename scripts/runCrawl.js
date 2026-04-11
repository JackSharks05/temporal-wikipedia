#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const distribution = require('../distribution');
const {runDistributedCrawler} = require('../crawler/distributedCrawler');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i === -1 || i + 1 >= process.argv.length) return fallback;
  return process.argv[i + 1];
}

function manyArgs(name) {
  const out = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === name && i + 1 < process.argv.length) {
      out.push(process.argv[i + 1]);
    }
  }
  return out;
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

// --- CLI args ---

const coordIp = arg('--ip', '127.0.0.1');
const coordPort = Number(arg('--port', '8080'));
const localWorkers = Number(arg('--local-workers', '0'));
const nodesFile = arg('--nodes-file', 'nodes.txt');
const seeds = manyArgs('--seed');
const articleCap = Number(arg('--article-cap', '100'));
const maxRounds = Number(arg('--max-rounds', '10'));
const historyLimit = Number(arg('--history-limit', '2000'));

if (!localWorkers && !nodesFile) {
  console.error('Multi-node crawler launcher');
  console.error('');
  console.error('Local mode (testing):');
  console.error('  node scripts/runCrawl.js --local-workers 3 --seed "Alan Turing" --article-cap 20');
  console.error('');
  console.error('Remote mode (AWS):');
  console.error('  node scripts/runCrawl.js --nodes-file nodes.txt --seed "Alan Turing" --article-cap 100000');
  console.error('');
  console.error('Options:');
  console.error('  --ip IP              coordinator bind address (default 127.0.0.1)');
  console.error('  --port PORT          coordinator port (default 9000)');
  console.error('  --local-workers N    spawn N local worker processes');
  console.error('  --nodes-file FILE    path to file with ip:port lines');
  console.error('  --seed TITLE         article seed (repeatable)');
  console.error('  --article-cap N      max articles to store (default 100)');
  console.error('  --max-rounds N       max crawl rounds (default 10)');
  console.error('  --history-limit N    revision history limit (default 2000)');
  process.exit(1);
}

// --- helpers ---

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

async function spawnLocalWorkers(dist, count, basePort) {
  for (let i = 0; i < count; i++) {
    const port = basePort + 1 + i;
    await call((cb) => dist.all.status.spawn({ip: '127.0.0.1', port}, cb));
    console.log(`[launcher] spawned local worker on 127.0.0.1:${port}`);
  }
}

async function addRemoteNodes(dist, nodes) {
  const id = dist.util.id;
  const currentGroup = await call((cb) => dist.local.groups.get('all', cb));
  const fullGroup = Object.assign({}, currentGroup);

  for (const node of nodes) {
    fullGroup[id.getSID(node)] = node;
    dist.local.groups.add('all', node, () => {});
    console.log(`[launcher] registered remote ${node.ip}:${node.port}`);
  }

  await call((cb) =>
    dist.all.comm.send(['all', fullGroup], {service: 'groups', method: 'put'}, cb),
  );
  console.log(`[launcher] broadcast membership to ${Object.keys(fullGroup).length} node(s)`);
}

// --- main ---

async function main() {
  const dist = distribution({ip: coordIp, port: coordPort});

  await new Promise((resolve, reject) => {
    dist.node.start((server) => {
      if (server instanceof Error) return reject(server);
      resolve(server);
    });
  });
  console.log(`[launcher] coordinator on ${coordIp}:${coordPort}`);

  if (localWorkers > 0) {
    await spawnLocalWorkers(dist, localWorkers, coordPort);
  } else if (nodesFile) {
    const nodes = parseNodesFile(nodesFile);
    if (!nodes.length) {
      console.error('[launcher] no nodes found in ' + nodesFile);
      process.exit(1);
    }
    await addRemoteNodes(dist, nodes);
  }

  const group = await call((cb) => dist.local.groups.get('all', cb));
  console.log(`[launcher] cluster ready: ${Object.keys(group).length} node(s)`);

  try {
    const result = await runDistributedCrawler({
      dist,
      ip: coordIp,
      port: coordPort,
      seeds: seeds.length ? seeds : undefined,
      articleCap,
      maxRounds,
      historyLimit,
    });
    console.log('[launcher] crawl complete:', JSON.stringify(result));
  } catch (err) {
    console.error('[launcher] crawl failed:', err);
  }

  try {
    await call((cb) => dist.all.status.stop(cb));
  } catch (e) {
    // remote workers may already be gone
  }
  dist.local.status.stop(() => process.exit(0));
}

main().catch((err) => {
  console.error('[launcher] fatal:', err);
  process.exit(1);
});
