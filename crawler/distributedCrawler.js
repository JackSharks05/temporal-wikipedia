#!/usr/bin/env node

const distribution = require('../distribution');
const {storeArticle} = require('../storage/wikiStore');
const {normalizeDisplayTitle, getTitleKey, DEFAULT_TIMEOUT_MS, DEFAULT_HISTORY_LIMIT, DEFAULT_USER_AGENT} = require('./wikiFetch');

const PAGE_PREFIX = 'page:';
const CRAWL_GID = 'crawl';
const WIKI_GID = 'wiki';
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_STALE_AFTER_MINUTES = 30;
const DEFAULT_ROUND_DELAY_MS = 0;
const DEFAULT_LANGUAGE = 'en';
const DEFAULT_PROJECT = 'wikipedia';
const DEFAULT_FETCH_PATH = require.resolve('./wikiFetch');
const SETTINGS = {crawlGid:CRAWL_GID,
  wikiGid:WIKI_GID,
  seed:'Distributed systems',
  batchSize:5,
  maxRounds:10,
  maxPages:100,
  maxDepth:2,
  maxRetries:DEFAULT_MAX_RETRIES,
  historyLimit:DEFAULT_HISTORY_LIMIT,
  maxOutgoingLinks:100,
  segmentSize:20,
  timeoutMs:DEFAULT_TIMEOUT_MS,
  staleAfterMinutes:DEFAULT_STALE_AFTER_MINUTES,
  roundDelayMs:DEFAULT_ROUND_DELAY_MS,
  language:DEFAULT_LANGUAGE,
  project:DEFAULT_PROJECT,
  userAgent:DEFAULT_USER_AGENT,
  fetchPath:DEFAULT_FETCH_PATH,
};
const EMPTY_PAGE = {
  status: 'pending',
  retries: 0,
  claimedAt: null,
  storedAt: null,
  pageId: null,
  revisionCount: 0,
  linkCount: 0,
  historyTruncated: false,
  lastError: null,
  rawArticle: null,
};

function pageKeyForTitle(title) {
  return PAGE_PREFIX + getTitleKey(title);
}

function pageRecord(title,depth,discoveredFrom,extra) {
  if (depth === undefined) depth = 0;
  if (discoveredFrom === undefined) discoveredFrom = null;
  if (!extra) extra = {};

  return Object.assign({},EMPTY_PAGE,{title:normalizeDisplayTitle(title), depth:depth, discoveredFrom:discoveredFrom, enqueuedAt: new Date().toISOString()}, extra);
}

function articleCap(options) {
  let cap = options.articleCap;
  if (cap === undefined || cap === null) cap = options.maxPages;
  if (Number.isFinite(cap) && cap >= 0) return cap;
  return Infinity;
}

function setup(options) {
  options = options || {};
  return {
    ip:options.ip || '127.0.0.1',
    port:options.port === undefined ? 9000 : options.port,
    crawlGid:SETTINGS.crawlGid,
    wikiGid:SETTINGS.wikiGid,
    seeds:(options.seeds || [SETTINGS.seed]).map(normalizeDisplayTitle),
    batchSize:SETTINGS.batchSize,
    maxRounds:options.maxRounds === undefined ? SETTINGS.maxRounds : options.maxRounds,
    maxPages:SETTINGS.maxPages,
    articleCap:options.articleCap === undefined ? SETTINGS.maxPages : options.articleCap,
    maxDepth:SETTINGS.maxDepth,
    maxRetries:SETTINGS.maxRetries,
    historyLimit:options.historyLimit === undefined ? SETTINGS.historyLimit : options.historyLimit,
    maxOutgoingLinks:SETTINGS.maxOutgoingLinks,
    segmentSize:SETTINGS.segmentSize,
    timeoutMs:SETTINGS.timeoutMs,
    staleAfterMinutes:SETTINGS.staleAfterMinutes,
    roundDelayMs:SETTINGS.roundDelayMs,
    language:SETTINGS.language,
    project:SETTINGS.project,
    userAgent:SETTINGS.userAgent,
    fetchPath:SETTINGS.fetchPath,
    dist:options.dist
  };
}

function normalizeError(err) {
  if (!err) return null;
  if (err instanceof Error) return err;
  if (typeof err === 'object') {
    let vals = Object.values(err);
    for (let i = 0; i < vals.length; i++) {
      if (vals[i]) return normalizeError(vals[i]);
    }
    return null;
  }
  return new Error(String(err));
}

function call(fn) {
  return new Promise((resolve,reject) => {
    fn((err, val) => {
      let fixed = normalizeError(err);
      if (fixed) return reject(fixed);
      resolve(val);
    });
  });
}

function read(store,gid,key,allowMissing) {
  if (allowMissing === undefined) allowMissing = false;

  return new Promise((resolve,reject) => {
    store.get({gid: gid, key: key},(err,val) => {
      let fixed = normalizeError(err);
      if (allowMissing && fixed && /Key not found/.test(fixed.message)) {
        return resolve(null);
      }

      if (fixed) return reject(fixed);
      resolve(val);
    });
  });
}

function write(store,gid,key,val) {
  return call((cb) => store.put(val,{gid:gid,key:key},cb));
}


function persistArticle(gid,article, segmentSize) {
  return new Promise((resolve,reject) => {
    storeArticle(gid,article,(err,meta) => {
      let fixed = normalizeError(err);
      if (fixed) return reject(fixed);
      resolve(meta);
    },{segmentSize: segmentSize});
  });
}

async function useGroup(dist,gid,group) {
  await call((cb) => dist.local.groups.put(gid, group, cb));
  await call((cb) => dist[gid].groups.put(gid, group, cb));
}

async function pageRecords(dist,gid) {
  let store = dist[gid].store;
  let keys = await read(store,gid,null);
  let out = [];


  for (let i = 0; i < keys.length; i++) {
    let key = keys[i];
    if (typeof key !== 'string') continue;
    if (!key.startsWith(PAGE_PREFIX)) continue;
    let val = await read(store,gid,key,true);

    if (val) out.push({key:key,value:val});
  }

  return out;
}

function summarize(records) {
  let counts = {total:0,pending:0,inflight:0,stored:0,failed:0};
  for (let i = 0; i < records.length; i++) {
    let status = records[i].value.status;
    counts.total++;
    if (counts[status] !== undefined) counts[status]++;
  }
  return counts;
}


async function seedTitles(dist,gid,titles) {
  let store = dist[gid].store;

  let made = 0;

  for (let i = 0; i < titles.length; i++) {
    let title = titles[i];
    let key = pageKeyForTitle(title);
    let already = await read(store,gid,key,true);
    if (already) continue;
    await write(store,gid,key,pageRecord(title));
    made++;
  }
  return made;
}


async function recoverInflight(dist,gid,staleAfterMs) {
  let store = dist[gid].store;
  let now = Date.now();
  let fixedCount = 0;
  let allPages = await pageRecords(dist, gid);

  for (let i = 0; i < allPages.length; i++) {
    let item = allPages[i];
    let when = Date.parse(item.value.claimedAt || '');
    if (item.value.status !== 'inflight') continue;
    if (!Number.isFinite(when)) continue;
    if (now - when < staleAfterMs) continue;

    await write(store,gid,item.key,Object.assign({},item.value,{status:'pending',claimedAt:null,rawArticle:null}));
    fixedCount++;
  }

  return fixedCount;
}

function makeMapper(options) {
  return new Function(`
    return function mapPage(key,value) {
      const fetcher = process.mainModule.require(${JSON.stringify(options.fetchPath)});
      const store = globalThis.distribution.local.store;
      const now = new Date().toISOString();

      function makePage(title, depth, from, extra) {
        return Object.assign({status:'pending',
          retries:0,
          claimedAt:null,
          storedAt:null,
          pageId:null,
          revisionCount:0,
          linkCount:0,
          historyTruncated:false,
          lastError:null,
          rawArticle:null,
          title:fetcher.normalizeDisplayTitle(title),
          depth:depth,
          discoveredFrom:from,
          enqueuedAt:now
        }, extra || {});
      }

      if (!value || value.status !== 'pending') return [];

      console.log('[worker] fetching: ' + value.title);

      const working = Object.assign({},value,{status:'inflight',claimedAt:now,lastError:null});
      store.put(working, {gid:${JSON.stringify(options.crawlGid)}, key:key}, () => {});


      try {
        const article = fetcher.fetchArticleBundle(value.title, ${JSON.stringify(options.fetchOptions)});

        store.put(makePage(value.title,value.depth,value.discoveredFrom,{
          status:'inflight',
          retries:value.retries,
          claimedAt:now,
          pageId:article.pageId,
          revisionCount:(article.revisions || []).length,
          linkCount:(article.links || []).length,
          historyTruncated:Boolean(article.truncated),
          rawArticle:{title: article.title, pageId: article.pageId, revisions: article.revisions}
        }), {gid:${JSON.stringify(options.crawlGid)}, key:key}, () => {});

        console.log('[worker] done: ' + value.title + ' revs=' + (article.revisions || []).length + ' links=' + (article.links || []).length);

        let found = [];

        let links = article.links || [];
        for (let i = 0; i < links.length; i++) {
          let title = links[i];
          let littleObj = {};
          littleObj[${JSON.stringify(PAGE_PREFIX)} +fetcher.getTitleKey(title)] = makePage(title, Number(value.depth || 0) + 1, value.title);
          found.push(littleObj);
        }
        return found;
      } catch (err) {
        console.log('[worker] failed: ' + value.title + ' err=' + (err && err.message ? err.message : String(err)));
        const tries = Number(value.retries ||0) + 1;
        store.put(Object.assign({}, value, {status:tries < ${options.maxRetries} ? 'pending' : 'failed',
          retries:tries,
          claimedAt:null,
          rawArticle:null,
          lastError:err && err.message ? err.message : String(err)
        }), {gid:${JSON.stringify(options.crawlGid)}, key:key}, () => {});
        return [];
      }
    };
  `)();
}

function makeReducer(crawlGid, maxDepth) {
  return new Function(`
    return function reducePage(key,values) {
      const store = globalThis.distribution.local.store;
      let stuff = Array.isArray(values) ? values : [values];
      stuff = stuff.filter(Boolean);
      let current = null;
      let best = null;

      store.get({gid: ${JSON.stringify(crawlGid)},key:key},(err,val) => {
        if (!err) current = val;
      });

      for (let i = 0; i < stuff.length; i++) {
        let v = stuff[i];
        if (!best || Number(v.depth || 0) < Number(best.depth || 0)) best = v;
      }

      if (!best) return null;
      if (Number(best.depth || 0) > ${maxDepth}) return null;

      if (!current) {
        store.put(best, {gid:${JSON.stringify(crawlGid)}, key:key}, () => {});
        return null;
      }

      if (current.status === 'pending' && Number(best.depth || 0) < Number(current.depth || 0)) {
        store.put(Object.assign({}, current, {depth:best.depth, discoveredFrom:best.discoveredFrom, enqueuedAt:best.enqueuedAt}), {gid:${JSON.stringify(crawlGid)}, key:key}, () => {});
      }
      return null;
    };
  `)();
}

async function runRound(dist,options,batch) {
  await call((cb) => dist[options.crawlGid].mr.exec({
    keys:batch.map((x) => x.key),
    map:makeMapper({
      crawlGid:options.crawlGid, fetchPath:options.fetchPath,
      fetchOptions: {
        timeoutMs:options.timeoutMs, userAgent:options.userAgent,
        historyLimit:options.historyLimit, maxOutgoingLinks:options.maxOutgoingLinks,
        language:options.language, project:options.project
      }, maxRetries: options.maxRetries
    }),
    reduce: makeReducer(options.crawlGid, options.maxDepth)
  }, cb));
}

async function ingestRound(dist,options,batch) {
  let store = dist[options.crawlGid].store;
  let result = {stored: 0, skipped: 0, failed: 0};


  for (let i = 0; i < batch.length; i++) {
    let key = batch[i].key;
    let record = await read(store,options.crawlGid,key,true);
    if (!record || record.status !== 'inflight' || !record.rawArticle) {
      result.skipped++;
      continue;
    }
    try {
      await persistArticle(options.wikiGid,record.rawArticle,options.segmentSize);

      await write(store, options.crawlGid, key, Object.assign({},record, {
        status:'stored',
        storedAt:new Date().toISOString(),
        rawArticle:null,
        lastError:null,
      }));

      result.stored++;
    } catch (err) {
      let tries = Number(record.retries || 0) + 1;

      await write(store, options.crawlGid, key, Object.assign({}, record, {status:tries < options.maxRetries ? 'pending' : 'failed', retries:tries, claimedAt:null, rawArticle:null, lastError:err.message}));
      result.failed++;
    }
  }
  return result;
}

async function crawlLoop(dist,options) {
  let group = await call((cb) => dist.local.groups.get('all',cb));
  await useGroup(dist,options.crawlGid,group);
  await useGroup(dist,options.wikiGid,group);

  let seeded = await seedTitles(dist,options.crawlGid,options.seeds);
  let recovered = await recoverInflight(dist,options.crawlGid,options.staleAfterMinutes * 60 * 1000);
  let cap = articleCap(options);

  console.log('[crawl] seeded=' + seeded + ' recovered=' + recovered + ' articleCap=' + (Number.isFinite(cap) ? cap : 'none'));

  for (let round = 1; round <= options.maxRounds; round++) {
    let allPages = await pageRecords(dist, options.crawlGid);
    let counts = summarize(allPages);
    let left = cap - counts.stored;
    if (left <= 0) break;

    let batch = allPages
        .filter((x) => x.value.status === 'pending' && x.value.depth <= options.maxDepth)
        .sort((a, b) => a.value.depth - b.value.depth || String(a.value.enqueuedAt).localeCompare(String(b.value.enqueuedAt)))
        .slice(0, Math.min(options.batchSize, left));

    if (!batch.length) break;

    console.log('[crawl] round '+ round + ': ' + batch.length+' pages');
    let t0 = Date.now();
    await runRound(dist, options, batch);
    let t1 = Date.now();
    let ingest = await ingestRound(dist, options, batch);
    let t2 = Date.now();
    let after = summarize(await pageRecords(dist, options.crawlGid));
    console.log('[crawl] round '+round+' stored='+ingest.stored+' failed='+ingest.failed+' skipped='+ingest.skipped+' pending='+after.pending+' totalStored='+after.stored+' (fetch '+((t1-t0)/1000).toFixed(1)+'s, ingest '+((t2-t1)/1000).toFixed(1)+'s)');

    if (after.stored >= cap) break;
    if (options.roundDelayMs) {
      await new Promise((resolve) => setTimeout(resolve,options.roundDelayMs));
    }
  }

  return summarize(await pageRecords(dist,options.crawlGid));
}

async function runDistributedCrawler(options) {
  options = setup(options);

  if (options.dist) {
    return crawlLoop(options.dist,options);
  }

  let dist = distribution({ip:options.ip, port:options.port});
  let finish = (code) => dist.local.status.stop(() => process.exit(code));

  dist.node.start(async (server) => {
    if (server instanceof Error) return finish(1);

    try {
      console.log('[crawl] final ' + JSON.stringify(await crawlLoop(dist,options)));
      finish(0);
    } catch (err) {
      console.error(err);
      finish(1);
    }
  });
}

module.exports = {PAGE_PREFIX,pageKeyForTitle,runDistributedCrawler,crawlLoop};

if (require.main === module) {
  function arg(name,fallback) {
    let i = process.argv.indexOf(name);
    if (i === -1 || i + 1 >= process.argv.length) return fallback;
    return process.argv[i + 1];
  }

  function manyArgs(name) {
    let out = [];
    for (let i = 0; i < process.argv.length; i++) {
      if (process.argv[i] === name && i + 1 < process.argv.length){
        out.push(process.argv[i + 1]);
      }
    }
    return out;
  }

  let seeds = manyArgs('--seed');
  if (!seeds.length) {
    let oneSeed = arg('--seed',null);
    if (oneSeed) seeds = [oneSeed];
  }

  runDistributedCrawler({ip: arg('--ip','127.0.0.1'),
    port: Number(arg('--port','9000')),
    seeds: seeds.length ? seeds : [SETTINGS.seed],
    articleCap: Number(arg('--article-cap',arg('--hard-cap',String(SETTINGS.maxPages)))),
    maxRounds: Number(arg('--max-rounds',String(SETTINGS.maxRounds))),
    historyLimit: Number(arg('--history-limit',String(SETTINGS.historyLimit)))
  });
}
