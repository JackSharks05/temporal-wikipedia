/**
 * temporalDiff mapper -- plain Node module, required on each worker
 * by the MR shim in indexer/temporalDiff/index.js at runtime.
 *
 * Invoked once per article (MR keyPrefix = 'article-meta:').
 *
 * High-level flow:
 *   1. Load article-manifest:<pageId> (metadata only, cheap).
 *   2. From the manifest, compute which segments OWN a year-end revision.
 *      A segment owns year Y iff Y ends inside it: yearOf(start) <= Y < yearOf(end).
 *      The final segment additionally owns its final year.
 *      Segments entirely inside a single year (not final) own nothing and
 *      are NEVER loaded.
 *   3. For each owning segment, load it once, rebuild from seg.base.content
 *      (a full snapshot via the crawler's carryOver mechanism), replay only
 *      its own deltas, and snapshot the cursor at the last revision with
 *      yearOf(ts) == Y for each Y it owns.
 *   4. Walk the active years in order and frequency-diff consecutive
 *      year-end snapshots (O(N+M) per pair, no LCS).
 *   5. Emit one {'<year>:<word>': {article, added, removed}} object per
 *      (year, word) pair seen.
 *
 * If the manifest is missing or malformed, log a warning and return [].
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

function tallyDiff(oldText, newText, yr, title, agg) {
  const oldFreq = Object.create(null);
  const newFreq = Object.create(null);
  for (const w of tok(oldText)) oldFreq[w] = (oldFreq[w] || 0) + 1;
  for (const w of tok(newText)) newFreq[w] = (newFreq[w] || 0) + 1;
  const seen = Object.create(null);
  for (const w of Object.keys(oldFreq)) seen[w] = true;
  for (const w of Object.keys(newFreq)) seen[w] = true;
  for (const w of Object.keys(seen)) {
    const o = oldFreq[w] || 0;
    const n = newFreq[w] || 0;
    if (o === n) continue;
    const yw = `${yr}:${w}`;
    if (!agg[yw]) agg[yw] = {article: title, added: 0, removed: 0};
    if (n > o) agg[yw].added += (n - o);
    else agg[yw].removed += (o - n);
  }
}

function buildSegToYears(segments) {
  const segToYears = Object.create(null);
  const yearSet = new Set();
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const yStart = yearOf(seg.startTimestamp);
    const yEnd = yearOf(seg.endTimestamp);
    for (let y = yStart; y <= yEnd; y++) yearSet.add(y);
    for (let y = yStart; y < yEnd; y++) {
      if (!segToYears[seg.segmentId]) segToYears[seg.segmentId] = [];
      segToYears[seg.segmentId].push(y);
    }
    if (i === segments.length - 1) {
      if (!segToYears[seg.segmentId]) segToYears[seg.segmentId] = [];
      segToYears[seg.segmentId].push(yEnd);
    }
  }
  const activeYears = Array.from(yearSet).sort((a, b) => a - b);
  return {segToYears, activeYears};
}

function snapshotYearEndsInSegment(seg, ownedYears) {
  const owned = new Set(ownedYears);
  const yearEnd = Object.create(null);
  if (!seg || !seg.base) return yearEnd;

  let cursor = seg.base.content || '';
  let currYear = yearOf(seg.base.timestamp);
  let currContent = cursor;

  const flush = (y, content) => {
    if (owned.has(y)) yearEnd[y] = content;
  };

  const deltas = seg.deltas || [];
  for (const delta of deltas) {
    const patched = Diff.applyPatch(cursor, delta.patch);
    if (patched !== false) cursor = patched;
    const y = yearOf(delta.timestamp);
    if (y === currYear) {
      currContent = cursor;
    } else {
      flush(currYear, currContent);
      currYear = y;
      currContent = cursor;
    }
  }
  flush(currYear, currContent);

  return yearEnd;
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
  const totalSegs = segments.length;
  const targetSegIds = Object.keys(segToYears);

  const t0 = Date.now();
  console.log(`[indexer] start: ${title} (pageId=${pageId}, segments=${totalSegs}, yearsActive=${activeYears.length}, targetSegs=${targetSegIds.length})`);

  const yearEnd = Object.create(null);
  let segsLoaded = 0;
  for (const segIdStr of targetSegIds) {
    const segId = Number(segIdStr);
    const seg = loadJsonKey(storeDir, `article-segment:${pageId}:${segId}`);
    if (!seg) {
      console.log(`[indexer] warning: missing segment ${segId} for ${title}; skipping`);
      continue;
    }
    segsLoaded++;
    const ownedYears = segToYears[segIdStr];
    const snapshots = snapshotYearEndsInSegment(seg, ownedYears);
    for (const y of Object.keys(snapshots)) {
      yearEnd[y] = snapshots[y];
    }
  }

  const agg = Object.create(null);
  let prev = null;
  for (const y of activeYears) {
    const curr = yearEnd[y];
    if (prev !== undefined && prev !== null && curr !== undefined) {
      tallyDiff(prev, curr, y, title, agg);
    }
    if (curr !== undefined) prev = curr;
  }

  const out = [];
  for (const yw of Object.keys(agg)) {
    const o = {};
    o[yw] = agg[yw];
    out.push(o);
  }

  const elapsedMs = Date.now() - t0;
  console.log(`[indexer] mapped: ${title} (pageId=${pageId}, loaded ${segsLoaded}/${totalSegs} segments, ${out.length} year:word entries, ${elapsedMs}ms)`);
  return out;
}

module.exports = {mapArticle, tok, yearOf};
