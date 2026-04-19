/**
 * temporalDiff mapper — invoked once per article (MR keyPrefix 'article-meta:').
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Diff = require('diff');

const STOP = new Set([
  'the', 'is', 'a', 'an', 'and', 'or', 'but', 'in', 'on',
  'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as',
  'was', 'were', 'been', 'be', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'it', 'its', 'this', 'that', 'these', 'those', 'not',
  'he', 'she', 'they', 'we', 'you', 'i', 'me', 'my',
  'are', 'am', 'also', 'can', 'may', 'so', 'than', 'then',
  'who', 'which', 'what', 'where', 'when', 'how', 'all',
  'each', 'every', 'both', 'few', 'more', 'most', 'other',
  'some', 'such', 'no', 'nor', 'only', 'own', 'same',
  'about', 'up', 'out', 'if', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'because',
  'until', 'while', 'just', 'over', 'under', 'again', 'further',
  'once', 'here', 'there', 'any', 'very', 'too', 'being',
]);

const TOKEN_RE = /[a-z0-9]+/g;

function yearOf(ts) {
  return new Date(ts).getUTCFullYear();
}

/**
 */
function tokenizeInto(text, freq) {
  if (!text) return freq;
  const lower = text.toLowerCase();
  TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = TOKEN_RE.exec(lower)) !== null) {
    const w = m[0];
    if (w.length <= 2 || STOP.has(w)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  return freq;
}

function loadJsonKey(storeDir, key) {
  const fn = crypto.createHash('sha256').update(key).digest('hex');
  const fp = path.join(storeDir, fn);
  if (!fs.existsSync(fp)) return null;
  try {
    const raw = fs.readFileSync(fp, 'utf8');
    const parsed = globalThis.distribution.util.deserialize(raw);
    return (parsed && 'value' in parsed) ? parsed.value : null;
  } catch (e) {
    return null;
  }
}


function buildSegToYears(segments) {
  const segToYears = Object.create(null);
  const yearSet = new Set();

  const addOwned = (segId, y) => {
    let arr = segToYears[segId];
    if (!arr) arr = segToYears[segId] = [];
    arr.push(y);
  };

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const yStart = yearOf(seg.startTimestamp);
    const yEnd = yearOf(seg.endTimestamp);
    for (let y = yStart; y <= yEnd; y++) yearSet.add(y);
    for (let y = yStart; y < yEnd; y++) addOwned(seg.segmentId, y);
    if (i === segments.length - 1) addOwned(seg.segmentId, yEnd);
  }

  const activeYears = Array.from(yearSet).sort((a, b) => a - b);
  return {segToYears, activeYears};
}

/**
 * Replay deltas on seg.base.content and, at each year transition owned by
 * this segment, tokenize the current snapshot directly into a Map<word,count>.
 *
 * Returns Map<year, Map<word, count>>. The snapshot string is never retained.
 */
function snapshotYearEndFreqsInSegment(seg, ownedYears) {
  const result = new Map();
  if (!seg || !seg.base) return result;

  const owned = new Set(ownedYears);
  let cursor = seg.base.content || '';
  let currYear = yearOf(seg.base.timestamp);
  let lastCursor = cursor;

  const flush = (y, content) => {
    if (!owned.has(y)) return;
    const freq = new Map();
    tokenizeInto(content, freq);
    result.set(y, freq);
  };

  for (const delta of (seg.deltas || [])) {
    const patched = Diff.applyPatch(cursor, delta.patch);
    if (patched !== false) cursor = patched;
    const y = yearOf(delta.timestamp);
    if (y === currYear) {
      lastCursor = cursor;
    } else {
      flush(currYear, lastCursor);
      currYear = y;
      lastCursor = cursor;
    }
  }
  flush(currYear, lastCursor);

  return result;
}

/**
 * Frequency-diff two word-count maps. Writes into `agg` keyed by "<year>:<word>".
 * O(|oldFreq| + |newFreq|); each word is visited at most twice.
 */
function tallyFromFreqs(oldFreq, newFreq, year, title, agg) {
  for (const [w, o] of oldFreq) {
    const n = newFreq.get(w) || 0;
    if (o === n) continue;
    const yw = year + ':' + w;
    let entry = agg[yw];
    if (!entry) entry = agg[yw] = {article: title, added: 0, removed: 0};
    if (n > o) entry.added += n - o;
    else entry.removed += o - n;
  }
  for (const [w, n] of newFreq) {
    if (oldFreq.has(w)) continue; // already handled above
    const yw = year + ':' + w;
    let entry = agg[yw];
    if (!entry) entry = agg[yw] = {article: title, added: 0, removed: 0};
    entry.added += n;
  }
}

function loadYearFreqs(storeDir, pageId, segments, segToYears) {
  const yearFreq = new Map();
  let segsLoaded = 0;
  for (const segIdStr of Object.keys(segToYears)) {
    const segId = Number(segIdStr);
    const seg = loadJsonKey(storeDir, `article-segment:${pageId}:${segId}`);
    if (!seg) continue;
    segsLoaded++;
    const snapshots = snapshotYearEndFreqsInSegment(seg, segToYears[segIdStr]);
    for (const [y, freq] of snapshots) yearFreq.set(y, freq);
  }
  return {yearFreq, segsLoaded};
}

function diffConsecutiveYears(yearFreq, activeYears, title) {
  const agg = Object.create(null);
  let prev = null;
  for (const y of activeYears) {
    const curr = yearFreq.get(y);
    if (prev && curr) tallyFromFreqs(prev, curr, y, title, agg);
    if (curr) prev = curr;
  }
  return agg;
}

function emit(agg) {
  const out = [];
  for (const yw of Object.keys(agg)) {
    out.push({[yw]: agg[yw]});
  }
  return out;
}

function mapArticle(key, meta, ctx) {
  if (!meta || !meta.pageId) {
    console.log(`[indexer] skipping key=${key}: meta missing or has no pageId`);
    return [];
  }

  const gid = ctx && ctx.gid;
  if (!gid) {
    console.log(`[indexer] skipping key=${key}: ctx.gid missing`);
    return [];
  }

  const pageId = String(meta.pageId);
  const title = meta.title || '';
  const nid = globalThis.distribution.util.id.getNID(
      globalThis.distribution.node.config);
  const storeDir = path.join(process.cwd(), 'store', nid, gid);
  const manifest = loadJsonKey(storeDir, `article-manifest:${pageId}`);
  if (!manifest || !Array.isArray(manifest.segments) || manifest.segments.length === 0) {
    console.log(`[indexer] no manifest for ${title} (pageId=${pageId}); skipping`);
    return [];
  }

  const segments = manifest.segments.slice().sort((a, b) => a.segmentId - b.segmentId);
  const {segToYears, activeYears} = buildSegToYears(segments);

  const t0 = Date.now();
  console.log(`[indexer] start: ${title} (pageId=${pageId}, segments=${segments.length}, yearsActive=${activeYears.length}, targetSegs=${Object.keys(segToYears).length})`);

  const {yearFreq, segsLoaded} = loadYearFreqs(storeDir, pageId, segments, segToYears);
  const agg = diffConsecutiveYears(yearFreq, activeYears, title);
  const out = emit(agg);

  const elapsedMs = Date.now() - t0;
  console.log(`[indexer] mapped: ${title} (pageId=${pageId}, loaded ${segsLoaded}/${segments.length} segments, ${out.length} year:word entries, ${elapsedMs}ms)`);
  return out;
}

module.exports = {mapArticle, tokenizeInto, yearOf};
