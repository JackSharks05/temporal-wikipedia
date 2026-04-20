#!/usr/bin/env node

const {shutdown, getArg, hasArg, parseNodesFile, getPrivateIp} = require('../lib/clusterConnect');
const {getArticleManifest, getPageIdForTitle} = require('./wikiStore');
const distribution = require('../distribution');

const lookup = process.argv[2];
if (!lookup || lookup.startsWith('--')) {
  console.log('Usage: node storage/checkStoredArticle.js <title-or-pageId> [options]');
  console.log('');
  console.log('Options:');
  console.log('  --page-id            treat argument as numeric page ID');
  console.log('  --nodes-file FILE    connect to cluster nodes');
  console.log('  --coord IP:PORT      coordinator address (default: auto-detect:8080)');
  console.log('  --gid GID            store group (default: wiki)');
  console.log('  --port PORT          local port for this node (default: 7999)');
  process.exit(1);
}

const gid = getArg('--gid', 'wiki');
const isPageId = hasArg('--page-id');

function inspectPage(dist, pageId) {
  getArticleManifest(gid, pageId, (err, manifest) => {
    if (err) {
      console.error('Error:', err.message || err);
      shutdown(dist).then(() => process.exit(1));
      return;
    }
    console.log(JSON.stringify(manifest, null, 2));
    shutdown(dist).then(() => process.exit(0));
  });
}

(async () => {
  const nodesFile = getArg('--nodes-file', null);
  const coordArg = getArg('--coord', null);
  const coordIp = coordArg ? coordArg.split(':')[0] : getPrivateIp();
  const coordPort = coordArg ? Number(coordArg.split(':')[1]) : 8080;
  const localPort = parseInt(getArg('--port', '7999'), 10);

  const dist = distribution({ip: coordIp, port: localPort});

  await new Promise((resolve, reject) => {
    dist.node.start((server) => {
      if (server instanceof Error) return reject(server);
      resolve(server);
    });
  });

  try {
    const id = dist.util.id;
    const nodes = nodesFile ? parseNodesFile(nodesFile) : [];
    const group = {};

    const coord = {ip: coordIp, port: coordPort};
    group[id.getSID(coord)] = coord;

    for (const node of nodes) {
      group[id.getSID(node)] = node;
    }

    await new Promise((resolve, reject) => {
      dist.local.groups.put(gid, group, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  } catch (err) {
    console.error('Failed to set up group:', err.message);
    process.exit(1);
  }

  if (isPageId) return inspectPage(dist, lookup);

  getPageIdForTitle(gid, lookup, (err, titleRecord) => {
    if (err) {
      console.error('Error:', err.message || err);
      shutdown(dist).then(() => process.exit(1));
      return;
    }
    console.log('Found pageId:', titleRecord.pageId, 'for title:', titleRecord.title);
    inspectPage(dist, titleRecord.pageId);
  });
})();
