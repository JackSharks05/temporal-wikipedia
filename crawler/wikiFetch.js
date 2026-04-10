const {execFileSync} = require('node:child_process');
const {JSDOM} = require('jsdom');
const {normalizeTitle} = require('../storage/segmentArticle');

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
  let txt = execFileSync('curl', ['--fail','--silent','--show-error','--location','--compressed','--max-time',String(secs),'--user-agent',ua,url],{encoding:'utf8',maxBuffer: 64 * 1024 * 1024});
  let parsed = JSON.parse(txt);

  if (parsed && parsed.error) {
    throw new Error(parsed.error.info || parsed.error.code || 'Wikipedia API error');
  }

  return parsed;
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

module.exports = {
  DEFAULT_TIMEOUT_MS,
  DEFAULT_HISTORY_LIMIT,
  DEFAULT_USER_AGENT,
  normalizeDisplayTitle,
  getTitleKey,
  shouldFollowArticleTitle,
  fetchCurrentPageHtml,
  extractBodyArticleLinksFromHtml,
  fetchRevisionHistory,
  fetchArticleBundle,
};
