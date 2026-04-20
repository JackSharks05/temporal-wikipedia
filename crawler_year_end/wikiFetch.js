const {spawnSync} = require('node:child_process');
const {JSDOM} = require('jsdom');
const {normalizeTitle} = require('../storage/segmentArticle');

const DEFAULT_TIMEOUT_MS = 20000;
const USER_AGENT = 'TemporalWikipediaCrawler/0.1 (Brown CSCI 1380 project)';

const BAD_PREFIXES = [
  'Wikipedia:', 'User:', 'Talk:', 'File:', 'Template:', 'Category:',
  'Portal:', 'Draft:', 'Module:', 'MediaWiki:', 'Help:', 'Book:',
  'TimedText:', 'Special:',
];
const BAD_PATTERNS = [
  /^List of /i, /^Lists of /i, /^Outline of /i, /^Index of /i,
  /^Glossary of /i, /^Comparison of /i, /^Comparisons of /i,
  /^Timeline of /i, /^Chronology of /i, /\(disambiguation\)$/i,
];
const STOP_HEADINGS = new Set([
  'references', 'notes', 'citations', 'sources',
  'further reading', 'external links', 'see also',
]);

function normalizeDisplayTitle(title) {
  return String(title || '').trim().replace(/_/g, ' ');
}

function getTitleKey(title) {
  return normalizeTitle(normalizeDisplayTitle(title));
}

function shouldFollowArticleTitle(title) {
  const t = normalizeDisplayTitle(title);
  if (!t || t.startsWith('#')) return false;
  for (const p of BAD_PREFIXES) if (t.startsWith(p)) return false;
  for (const p of BAD_PATTERNS) if (p.test(t)) return false;
  return true;
}

function api(params, options) {
  options = options || {};
  const secs = Math.max(1, Math.ceil((options.timeoutMs || DEFAULT_TIMEOUT_MS) / 1000));
  const lang = options.language || 'en';
  const project = options.project || 'wikipedia';

  const cleaned = {};
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') cleaned[k] = v;
  }

  const url = `https://${lang}.${project}.org/w/api.php?${new URLSearchParams(cleaned).toString()}`;
  const res = spawnSync('curl', [
    '--silent', '--show-error', '--location', '--compressed',
    '--max-time', String(secs),
    '--user-agent', USER_AGENT,
    url,
  ], {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});

  if (res.status !== 0) {
    throw new Error((res.stderr || '').trim() || `curl failed (exit ${res.status})`);
  }

  const parsed = JSON.parse(res.stdout);
  if (parsed && parsed.error) {
    throw new Error(parsed.error.info || parsed.error.code || 'Wikipedia API error');
  }
  return parsed;
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

function fetchCurrentPageHtml(title, options) {
  const payload = api({
    action: 'parse',
    page: normalizeDisplayTitle(title),
    prop: 'text',
    redirects: '1',
    format: 'json',
    formatversion: '2',
  }, options);

  if (!payload.parse || !payload.parse.text) {
    throw new Error(`No parsed HTML returned for "${title}"`);
  }
  return {
    title: normalizeDisplayTitle(payload.parse.title || title),
    pageId: String(payload.parse.pageid || ''),
    html: String(payload.parse.text),
  };
}

function extractBodyArticleLinksFromHtml(html, options) {
  options = options || {};
  const dom = new JSDOM('<body>' + (html || '') + '</body>');
  const root = dom.window.document.querySelector('.mw-parser-output');
  if (!root) return [];

  const out = [];
  const seen = new Set();
  const me = options.currentTitle ? getTitleKey(options.currentTitle) : null;

  for (const kid of Array.from(root.children)) {
    if (kid.classList && kid.classList.contains('mw-heading')) {
      const head = (kid.textContent || '').replace(/\[edit\]/gi, '').trim().toLowerCase();
      if (STOP_HEADINGS.has(head)) break;
      continue;
    }

    if (kid.tagName !== 'P' || kid.classList.contains('mw-empty-elt')) continue;

    for (const a of kid.querySelectorAll('a[href]')) {
      let href = String(a.getAttribute('href') || '');
      href = href.split('#')[0].split('?')[0];

      if (!href.startsWith('/wiki/')) continue;
      if (a.closest('sup.reference')) continue;

      let title;
      try {
        title = normalizeDisplayTitle(decodeURIComponent(href.slice('/wiki/'.length)));
      } catch {
        continue;
      }

      if (!shouldFollowArticleTitle(title)) continue;

      const key = getTitleKey(title);
      if (key === me || seen.has(key)) continue;
      seen.add(key);
      out.push(title);
    }
  }

  return out;
}

module.exports = {
  api,
  revisionContent,
  normalizeDisplayTitle,
  fetchCurrentPageHtml,
  extractBodyArticleLinksFromHtml,
};
