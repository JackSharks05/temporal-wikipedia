#!/usr/bin/env node

const distribution = require('../distribution');
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

const lookup = process.argv[2];
if (!lookup || lookup.startsWith('--')) {
  console.log('Usage: node storage/checkStoredArticle.js <pageId-or-title> [--title] [--gid all] [--port 9000]');
  process.exit(1);
}

const gid = getArg('--gid','all');
const port = parseInt(getArg('--port','9000'),10);
const ip = getArg('--ip','127.0.0.1');
const isTitle = hasArg('--title');
const dist = distribution({ip,port});

function finish(code) {
  dist.local.status.stop(() => process.exit(code));
}

function inspectPage(pageId) {
  getArticleManifest(gid,pageId,(manifestError,manifest) => {
    if (manifestError) {
      console.error(manifestError);
      return finish(1);
    }

    console.log(JSON.stringify(manifest,null,2));
    finish(0);
  });
}

dist.node.start((server) => {
  if (server instanceof Error) {
    console.error(server);
    return finish(1);
  }

  if (!isTitle) return inspectPage(lookup);

  getPageIdForTitle(gid,lookup,(titleError,titleRecord) => {
    if (titleError) {
      console.error(titleError);
      return finish(1);
    }
    inspectPage(titleRecord.pageId);
  });
});
