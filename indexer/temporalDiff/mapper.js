/**
 * temporalDiff mapper — plain Node module, required on each worker
 * by the MR shim in indexer/temporalDiff/index.js at runtime.
 *
 * Signature (called once per article):
 *   mapArticle(gid, key, meta) -> Array<{ "<year>:<word>": { article, added, removed } }>
 *
 * Flow:
 *   1. Load article-segment:<pageId>:0..N one segment at a time via fs + sha256
 *      (guaranteed co-located by placement key article-home:<pageId>).
 *   2. Walk revisions in chronological order, applying patches to a single
 *      content cursor.
 *   3. Sliding-window year tracking: remember the last revision of the
 *      previous active year (prevEnd) and the latest revision of the
 *      current year (currLatest). On year transition, diff(prevEnd,
 *      currLatest) and attribute the changes to currYear.
 *   4. After the last revision, flush the final year.
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

function tok(text) {
  if (!text) return [];
  return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w && !STOP.has(w) && w.length > 2);
}

function yearOf(ts) {
  return new Date(ts).getUTCFullYear();
}

function loadSegment(storeDir, pageId, sid) {
  const segKey = `article-segment:${pageId}:${sid}`;
  const fn = crypto.createHash('sha256').update(segKey).digest('hex');
  const fp = path.join(storeDir, fn);
  if (!fs.existsSync(fp)) return null;
  try {
    const raw = fs.readFileSync(fp, 'utf8');
    const parsed = globalThis.distribution.util.deserialize(raw);
    return (parsed && parsed.value) ? parsed.value : null;
  } catch (e) {
    return null;
  }
}

function tallyDiff(oldText, newText, yr, title, agg) {
  const changes = Diff.diffWords(oldText, newText, {ignoreCase: true});
  for (const ch of changes) {
    if (!ch.added && !ch.removed) continue;
    const words = tok(ch.value);
    for (const word of words) {
      const yw = `${yr}:${word}`;
      if (!agg[yw]) agg[yw] = {article: title, added: 0, removed: 0};
      if (ch.added) agg[yw].added += 1;
      if (ch.removed) agg[yw].removed += 1;
    }
  }
}

/**
 * Ingest a single revision into the sliding-window state.
 *
 * @param {string} content - full text at this revision
 * @param {string} ts - timestamp string
 * @param {object} state - {prevEnd, currYear, currLatest, title, agg}
 */
function ingest(content, ts, state) {
  const y = yearOf(ts);
  if (state.currYear === null) {
    state.currYear = y;
    state.currLatest = content;
    return;
  }
  if (y === state.currYear) {
    state.currLatest = content;
    return;
  }
  if (state.prevEnd !== null) {
    tallyDiff(state.prevEnd, state.currLatest, state.currYear, state.title, state.agg);
  }
  state.prevEnd = state.currLatest;
  state.currYear = y;
  state.currLatest = content;
}

function mapArticle(gid, key, meta) {
  if (!meta) {
    console.log(`[indexer] skipping key=${key}: meta is ${meta === null ? 'null' : typeof meta}`);
    return [];
  }
  if (!meta.pageId) {
    console.log(`[indexer] skipping key=${key}: meta missing pageId; keys=${Object.keys(meta).join(',')}`);
    return [];
  }

  const pageId = String(meta.pageId);
  const title = meta.title || '';

  const nid = globalThis.distribution.util.id.getNID(
      globalThis.distribution.node.config);
  const storeDir = path.join(process.cwd(), 'store', nid, gid);

  const firstSeg = loadSegment(storeDir, pageId, 0);
  if (!firstSeg || !firstSeg.base) {
    console.log(`[indexer] skipping ${title} (no local segment 0 for pageId=${pageId}, storeDir=${storeDir})`);
    return [];
  }

  console.log(`[indexer] start: ${title} (pageId=${pageId})`);

  const state = {
    prevEnd: null,
    currYear: null,
    currLatest: null,
    title,
    agg: Object.create(null),
  };

  let content = firstSeg.base.content || '';
  ingest(content, firstSeg.base.timestamp, state);
  const firstDeltas = firstSeg.deltas || [];
  for (const delta of firstDeltas) {
    const patched = Diff.applyPatch(content, delta.patch);
    if (patched !== false) content = patched;
    ingest(content, delta.timestamp, state);
  }
  let segCount = 1;

  for (let sid = 1; sid < 100000; sid++) {
    const seg = loadSegment(storeDir, pageId, sid);
    if (!seg) break;
    const deltas = seg.deltas || [];
    for (const delta of deltas) {
      const patched = Diff.applyPatch(content, delta.patch);
      if (patched !== false) content = patched;
      ingest(content, delta.timestamp, state);
    }
    segCount++;
  }

  if (state.prevEnd !== null && state.currLatest !== null) {
    tallyDiff(state.prevEnd, state.currLatest, state.currYear, state.title, state.agg);
  }

  const out = [];
  for (const yw of Object.keys(state.agg)) {
    const o = {};
    o[yw] = state.agg[yw];
    out.push(o);
  }

  console.log(`[indexer] mapped: ${title} (pageId=${pageId}, ${segCount} segments, ${out.length} year:word entries)`);
  return out;
}

module.exports = {mapArticle, tok, yearOf};
