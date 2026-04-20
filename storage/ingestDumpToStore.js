#!/usr/bin/env node

const distribution = require('../distribution');
const {processDump} = require('../crawler/crawler');
const {storeArticle} = require('./wikiStore');
const {getArg, hasArg} = require('../lib/clusterConnect');

const dumpPath = process.argv[2];
if (!dumpPath || dumpPath.startsWith('--')) {
  console.log('Usage: node storage/ingestDumpToStore.js <dump.xml[.bz2|.gz]> [--limit N] [--gid all] [--port 9000]');
  process.exit(1);
}

const gid = getArg('--gid','all');
const limitArg = getArg('--limit');
const limit = limitArg ? parseInt(limitArg,10) : Infinity;
const port = parseInt(getArg('--port','9000'),10);
const ip = getArg('--ip','127.0.0.1');
const quiet = hasArg('--quiet');

const dist = distribution({ip,port});
let stored = 0;
let failed = 0;
let pending = 0;
let parsingDone = false;
let finished = false;

function finish(code) {
  if (finished) return;
  finished = true;
  dist.local.status.stop(() => process.exit(code));
}

function maybeFinish() {
  if (!parsingDone || pending !== 0) return;
  console.log(`Stored ${stored} articles (${failed} failed).`);
  finish(failed === 0 ? 0 : 1);
}

dist.node.start((server) => {
  if (server instanceof Error) {
    console.error(server);
    return finish(1);
  }

  processDump(dumpPath, {
    limit,
    maxRevisions: Infinity,
    emitRevisions: true,
    onArticle: (article) => {
      pending += 1;
      storeArticle(gid,article,(error,meta) => {
        pending -= 1;
        if (error) {
          failed += 1;
          console.error(`Failed to store ${article.title}:`,error.message);
        } else {
          stored += 1;
          if (!quiet) {
            console.log(`Stored ${meta.title}: ${meta.revisionCount} revisions in ${meta.segmentCount} segments`);
          }
        }
        maybeFinish();
      });
    },
  }).then(() => {
    parsingDone = true;
    maybeFinish();
  }).catch((error) => {
    console.error(error);
    finish(1);
  });
});
