const {execFileSync, spawnSync} = require('node:child_process');
const {JSDOM} = require('jsdom');
const {normalizeTitle, createSegment} = require('../storage/segmentArticle');

const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_HISTORY_LIMIT = 2000;
const DEFAULT_USER_AGENT = 'TemporalWikipediaCrawler/0.1 (Brown CSCI 1380 project)';
const BAD_PREFIXES = ['Wikipedia:', 'User:', 'Talk:', 'File:', 'Template:', 'Category:', 'Portal:', 'Draft:', 'Module:', 'MediaWiki:', 'Help:', 'Book:', 'TimedText:', 'Special:'];
const BAD_PATTERNS = [/^List of /i, /^Lists of /i, /^Outline of /i, /^Index of /i, /^Glossary of /i, /^Comparison of /i, /^Comparisons of /i, /^Timeline of /i, /^Chronology of /i, /\(disambiguation\)$/i];
const STOP_HEADINGS = new Set(['references', 'notes', 'citations', 'sources', 'further reading', 'external links', 'see also']);

function normalizeDisplayTitle(title) {
  return String(title || '').trim().replace(/_/g, ' ');
}

function getTitleKey(title) {
  return normalizeTitle(normalizeDisplayTitle(title));
}

function shouldFollowArticleTitle(title) {
  let t = normalizeDisplayTitle(title);
  if (!t || t.startsWith('#')) return false;

  for (let i = 0; i < BAD_PREFIXES.length; i++) {
    if (t.startsWith(BAD_PREFIXES[i])) {
      return false;
    }
  }


  for (let i = 0; i < BAD_PATTERNS.length; i++) {
    if (BAD_PATTERNS[i].test(t)) {
      return false;
    }
  }

  return true;
}

const API_MAX_ATTEMPTS = 4;
const API_THROTTLE_MS = 500;
const FALLBACK_BACKOFF = [5, 10, 20];
let lastApiCallMs = 0;

function api(params,options) {
  options = options || {};

  let secs = Math.ceil((options.timeoutMs || DEFAULT_TIMEOUT_MS) / 1000);
  if (secs < 1) secs = 1;

  let ua = options.userAgent || DEFAULT_USER_AGENT;
  let cleaned = {};
  let pairs = Object.entries(params || {});
  for (let i = 0; i < pairs.length; i++) {
    let k = pairs[i][0];
    let v = pairs[i][1];
    if (v !== undefined && v !== null && v !== '') {
      cleaned[k] = v;
    }
  }

  let lang = options.language || 'en';
  let project = options.project || 'wikipedia';
  let url = 'https://' + lang + '.' + project + '.org/w/api.php?' + new URLSearchParams(cleaned).toString();
  let curlArgs = ['--silent','--show-error','--location','--compressed',
    '--max-time',String(secs),'--user-agent',ua,
    '-w','\n%{http_code}',
    url];

  for (let attempt = 0; attempt < API_MAX_ATTEMPTS; attempt++) {
    let now = Date.now();
    let gap = now - lastApiCallMs;
    if (lastApiCallMs > 0 && gap < API_THROTTLE_MS) {
      execFileSync('sleep', [String((API_THROTTLE_MS - gap) / 1000)]);
    }
    lastApiCallMs = Date.now();

    let res = spawnSync('curl', curlArgs, {encoding:'utf8', maxBuffer: 64 * 1024 * 1024});
    let output = (res.stdout || '').trimEnd();
    let lastNl = output.lastIndexOf('\n');
    let statusCode = parseInt(output.substring(lastNl + 1), 10) || 0;
    let body = lastNl >= 0 ? output.substring(0, lastNl) : '';

    if (statusCode === 429) {
      let wait = FALLBACK_BACKOFF[attempt] || 20;
      console.log('[wikiFetch] 429 rate-limited, waiting ' + wait + 's (attempt ' + (attempt + 1) + '/' + API_MAX_ATTEMPTS + ')');
      execFileSync('sleep', [String(wait)]);
      continue;
    }

    if ((res.status !== 0 && !body.trim()) || (statusCode >= 400 && !body.trim())) {
      let errMsg = (res.stderr || '').trim() || 'curl failed with status ' + statusCode + ' exit code ' + res.status;
      if (attempt < API_MAX_ATTEMPTS - 1) {
        console.log('[wikiFetch] curl error, retrying in 5s: ' + errMsg.split('\n')[0]);
        execFileSync('sleep', ['5']);
        continue;
      }
      throw new Error(errMsg);
    }

    let parsed = JSON.parse(body);

    if (parsed && parsed.error) {
      throw new Error(parsed.error.info || parsed.error.code || 'Wikipedia API error');
    }

    return parsed;
  }
  throw new Error('Wikipedia API: max retries exceeded for ' + url);
}

function fetchCurrentPageHtml(title,options) {
  let stuff = api({action: 'parse',page: normalizeDisplayTitle(title),prop:'text',redirects:'1',format:'json',formatversion:'2'},options);

  if (!stuff.parse || !stuff.parse.text) {
    throw new Error('No parsed HTML returned for "' + title + '"');
  }
  return {title: normalizeDisplayTitle(stuff.parse.title || title), pageId: String(stuff.parse.pageid || ''), html: String(stuff.parse.text)};
}

function extractBodyArticleLinksFromHtml(html,options) {
  options = options || {};
  let dom = new JSDOM('<body>' + (html || '') + '</body>');
  let root = dom.window.document.querySelector('.mw-parser-output');
  if (!root) return [];

  let out = [];
  let already = new Set();
  let me = null;
  if (options.currentTitle) {
    me = getTitleKey(options.currentTitle);
  }

  let kids = Array.from(root.children);

  for (let i = 0; i < kids.length; i++) {
    let kid = kids[i];

    if (kid.classList && kid.classList.contains('mw-heading')) {
      let head = (kid.textContent || '').replace(/\[edit\]/gi,'').trim().toLowerCase();
      if (STOP_HEADINGS.has(head)) break;
      continue;
    }

    if (kid.tagName !== 'P' || kid.classList.contains('mw-empty-elt')) continue;

    let anchors = kid.querySelectorAll('a[href]');
    for (let j = 0; j < anchors.length; j++) {
      let a = anchors[j];
      let href = String(a.getAttribute('href') || '');
      href = href.split('#')[0];
      href = href.split('?')[0];

      if (!href.startsWith('/wiki/')) continue;
      if (a.closest('sup.reference')) continue;
      let title = '';
      try {
        title = normalizeDisplayTitle(decodeURIComponent(href.slice('/wiki/'.length)));
      } catch (err) {
        continue;
      }

      if (!shouldFollowArticleTitle(title)) continue;

      let littleKey = getTitleKey(title);
      if (littleKey === me) continue;
      if (already.has(littleKey)) continue;

      already.add(littleKey);
      out.push(title);
    }
  }

  return out;
}

function revisionContent(revision) {
  if (!revision) return '';
  if (revision.content) return revision.content;
  if (revision.slots && revision.slots.main) {
    if (revision.slots.main.content) return revision.slots.main.content;
    if (revision.slots.main['*']) return revision.slots.main['*'];
  }
  if (revision['*']) return revision['*'];
  return '';
}

function fetchRevisionHistory(title,options) {
  options = options || {};

  let lim = Math.floor(options.historyLimit || DEFAULT_HISTORY_LIMIT);
  if (lim < 1) lim = 1;

  let revs = [];
  let goAgain = null;
  let pageId = '';
  let currentTitle = normalizeDisplayTitle(title);

  while (revs.length < lim) {
    let payload = api({
      action:'query', prop:'revisions',titles:currentTitle, redirects:'1', rvprop:'ids|timestamp|content', rvslots:'main',
      rvdir: 'newer', rvlimit:String(Math.min(50, lim - revs.length)), rvcontinue:goAgain, format:'json', formatversion:'2'}, options);

    let p = payload.query && payload.query.pages && payload.query.pages[0];
    if (!p || p.missing) {
      throw new Error('No revision history returned for "' + title + '"');
    }

    pageId = String(p.pageid || pageId);
    currentTitle = normalizeDisplayTitle(p.title || currentTitle);

    let littleRevs = p.revisions || [];
    for (let i = 0; i < littleRevs.length; i++) {
      let r = littleRevs[i];
      revs.push({
        revId: String(r.revid || ''), parentId: String(r.parentid || ''),
        timestamp: String(r.timestamp || ''), content: revisionContent(r)});
      if (revs.length >= lim) break;
    }

    goAgain = payload.continue && payload.continue.rvcontinue;
    if (!goAgain) break;
  }

  if (revs.length === 0) {
    throw new Error('No usable revisions found for "' + title + '"');
  }

  return {
    title: currentTitle, pageId:pageId, revisions:revs, truncated:Boolean(goAgain),
  };
}

function fetchArticleBundle(title,options) {
  options = options || {};
  let current = fetchCurrentPageHtml(title,options);
  let hist = fetchRevisionHistory(current.title,options);
  let links = extractBodyArticleLinksFromHtml(current.html,{currentTitle: current.title});
  let maxLinks = options.maxOutgoingLinks;
  if (maxLinks === undefined || maxLinks === null) maxLinks = Infinity;
  if (maxLinks < 0) maxLinks = 0;
  links = links.slice(0, maxLinks);

  return {title:hist.title, pageId:hist.pageId || current.pageId, revisions:hist.revisions, links:links, truncated:hist.truncated};
}

/**
 * Streaming fetch+segment+store: fetches revisions 50 at a time from the
 * Wikipedia API, creates a segment from each batch, writes it to the
 * distributed store immediately, then discards the batch.
 * Peak memory stays flat regardless of total revision count.
 *
 * @param {string} title - Article title
 * @param {string} wikiGid - Group ID for the wiki store
 * @param {object} options - fetchOptions (historyLimit, timeoutMs, etc.)
 * @returns {{ title, pageId, revisionCount, segmentCount, truncated, links }}
 */
function fetchAndStoreRevisions(title, wikiGid, options) {
  options = options || {};

  const current = fetchCurrentPageHtml(title, options);
  const resolvedTitle = current.title;
  const links = extractBodyArticleLinksFromHtml(current.html, {currentTitle: resolvedTitle});

  let lim = Math.floor(options.historyLimit || DEFAULT_HISTORY_LIMIT);
  if (lim < 1) lim = 1;

  const store = globalThis.distribution[wikiGid].store;
  const titleKey = normalizeTitle(resolvedTitle);

  let rvcontinue = null;
  let pageId = '';
  let currentTitle = normalizeDisplayTitle(resolvedTitle);
  let segmentId = 0;
  let totalRevs = 0;
  let manifestSegments = [];
  let firstTimestamp = null;
  let latestTimestamp = null;
  let latestRevId = null;

  // Carry the last revision across batches so deltas bridge segment boundaries
  let carryOver = null;

  while (totalRevs < lim) {
    let batchLimit = Math.min(50, lim - totalRevs);
    let payload = api({
      action: 'query', prop: 'revisions', titles: currentTitle,
      redirects: '1', rvprop: 'ids|timestamp|content', rvslots: 'main',
      rvdir: 'newer', rvlimit: String(batchLimit),
      rvcontinue: rvcontinue, format: 'json', formatversion: '2',
    }, options);

    let p = payload.query && payload.query.pages && payload.query.pages[0];
    if (!p || p.missing) {
      throw new Error('No revision history returned for "' + title + '"');
    }

    pageId = String(p.pageid || pageId);
    currentTitle = normalizeDisplayTitle(p.title || currentTitle);

    let rawRevs = p.revisions || [];
    if (rawRevs.length === 0) break;

    let batchRevs = [];
    for (let i = 0; i < rawRevs.length; i++) {
      let r = rawRevs[i];
      batchRevs.push({
        revId: String(r.revid || ''),
        parentId: String(r.parentid || ''),
        timestamp: String(r.timestamp || ''),
        content: revisionContent(r),
      });
      if (totalRevs + batchRevs.length >= lim) break;
    }

    if (!firstTimestamp) firstTimestamp = batchRevs[0].timestamp;
    let lastRev = batchRevs[batchRevs.length - 1];
    latestTimestamp = lastRev.timestamp;
    latestRevId = lastRev.revId;

    // Prepend carried-over revision so deltas bridge segment boundaries
    let revsForSegment = carryOver ? [carryOver].concat(batchRevs) : batchRevs;
    let segment = createSegment(pageId, currentTitle, segmentId, revsForSegment);

    store.put(segment, {
      gid: wikiGid,
      key: 'article-segment:' + pageId + ':' + segmentId,
    }, function() {});

    manifestSegments.push({
      segmentId: segment.segmentId,
      startRevId: segment.startRevId,
      endRevId: segment.endRevId,
      startTimestamp: segment.startTimestamp,
      endTimestamp: segment.endTimestamp,
      revisionCount: segment.revisionCount,
    });

    carryOver = lastRev;
    segmentId++;
    totalRevs += batchRevs.length;

    rvcontinue = payload.continue && payload.continue.rvcontinue;
    if (!rvcontinue) break;
  }

  if (totalRevs === 0) {
    throw new Error('No usable revisions found for "' + title + '"');
  }

  // Write manifest, meta, and title record
  let manifest = {pageId: pageId, title: currentTitle, segmentSize: 50, segments: manifestSegments};
  let meta = {
    pageId: pageId, title: currentTitle, latestRevId: latestRevId,
    firstTimestamp: firstTimestamp, latestTimestamp: latestTimestamp,
    revisionCount: totalRevs, segmentCount: segmentId, segmentSize: 50,
  };
  let titleRecord = {pageId: pageId, title: currentTitle};

  store.put(manifest, {gid: wikiGid, key: 'article-manifest:' + pageId}, function() {});
  store.put(meta, {gid: wikiGid, key: 'article-meta:' + pageId}, function() {});
  store.put(titleRecord, {gid: wikiGid, key: 'article-title:' + titleKey}, function() {});

  let maxLinks = options.maxOutgoingLinks;
  if (maxLinks === undefined || maxLinks === null) maxLinks = Infinity;
  if (maxLinks < 0) maxLinks = 0;

  return {
    title: currentTitle, pageId: pageId,
    revisionCount: totalRevs, segmentCount: segmentId,
    truncated: Boolean(rvcontinue),
    links: links.slice(0, maxLinks),
  };
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  DEFAULT_HISTORY_LIMIT,
  DEFAULT_USER_AGENT,
  api,
  revisionContent,
  normalizeDisplayTitle,
  getTitleKey,
  shouldFollowArticleTitle,
  fetchCurrentPageHtml,
  extractBodyArticleLinksFromHtml,
  fetchRevisionHistory,
  fetchArticleBundle,
  fetchAndStoreRevisions,
};
