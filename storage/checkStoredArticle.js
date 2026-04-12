#!/usr/bin/env node

const {connectToCluster, shutdown, getArg, hasArg} = require('../lib/clusterConnect');
const {getArticleManifest, getPageIdForTitle} = require('./wikiStore');

const lookup = process.argv[2];
if (!lookup || lookup.startsWith('--')) {
  console.log('Usage: node storage/checkStoredArticle.js <title-or-pageId> [options]');
  console.log('');
  console.log('Options:');
  console.log('  --page-id            treat argument as numeric page ID');
  console.log('  --nodes-file FILE    connect to cluster nodes');
  console.log('  --gid GID            store group (default: wiki)');
  console.log('  --port PORT          local port for this node (default: 7999)');
  console.log('  --ip IP              local IP (auto-detected if --nodes-file is set)');
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
  let dist;
  try {
    dist = await connectToCluster({
      nodesFile: getArg('--nodes-file', null),
      gid,
      port: parseInt(getArg('--port', '7999'), 10),
      ip: getArg('--ip', null),
    });
  } catch (err) {
    console.error('Failed to connect:', err.message);
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
