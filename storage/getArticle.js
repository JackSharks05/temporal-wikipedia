const Diff = require('diff');
const {
  getArticleManifest,
  getArticleSegment,
} = require('./wikiStore');

function findSegmentForTimestamp(manifest, timestamp) {
  const target = new Date(timestamp).getTime();
  let result = null;
  for (const seg of manifest.segments) {
    if (new Date(seg.startTimestamp).getTime() <= target) {
      result = seg.segmentId;
    } else {
      break;
    }
  }
  return result;
}

function replaySegmentToTimestamp(segment, timestamp) {
  const target = new Date(timestamp).getTime();

  if (!segment || !segment.base) return null;
  if (new Date(segment.base.timestamp).getTime() > target) return null;

  let content = segment.base.content || '';
  let lastTimestamp = segment.base.timestamp;

  for (const delta of segment.deltas || []) {
    if (new Date(delta.timestamp).getTime() > target) break;
    const patched = Diff.applyPatch(content, delta.patch);
    if (patched !== false) {
      content = patched;
      lastTimestamp = delta.timestamp;
    }
  }

  return {content, timestamp: lastTimestamp};
}

/**
 * Get article content at a specific timestamp.
 * manifest -> segment -> replay deltas.
 */
function getContentAtTimestamp(gid, manifest, timestamp, callback) {
    if (!manifest.segments || manifest.segments.length === 0) {
      return callback(new Error(`No segments for article ${manifest.pageId}`));
    }
    const segmentId = findSegmentForTimestamp(manifest, timestamp);
    if (segmentId === null) return callback(null, null);

    getArticleSegment(gid, manifest.pageId, segmentId, (segErr, segment) => {
      if (segErr) return callback(segErr);
      callback(null, replaySegmentToTimestamp(segment, timestamp));
    });
}

/**
 * Get all years where an article had edits.
 */
function getArticleActiveYears(gid, manifest, callback) {
  if (!manifest.segments || manifest.segments.length === 0) {
      return callback(null, []);
  }

  const years = new Set();
  let pending = manifest.segments.length;

  for (const seg of manifest.segments) {
      getArticleSegment(gid, manifest.pageId, seg.segmentId, (segErr, segment) => {
        if (!segErr && segment) {
          if (segment.base && segment.base.timestamp) {
            years.add(new Date(segment.base.timestamp).getUTCFullYear());
          }
          for (const delta of segment.deltas || []) {
            years.add(new Date(delta.timestamp).getUTCFullYear());
          }
        }
        if (--pending === 0) {
            callback(null, [...years].sort((a, b) => a - b));
        }
    });
  }
}

/**
 * List all stored articles with their metadata.
 * Returns manifests of all articles
 */
function listArticles(gid, callback) {
  const store = globalThis.distribution && globalThis.distribution[gid] &&
      globalThis.distribution[gid].store;
  if (!store) return callback(new Error(`group not found: ${gid}`));

  store.get({key: null, gid}, (err, allKeys) => {
    if (err && typeof err === 'object' && Object.keys(err).length > 0) {
      return callback(err instanceof Error ? err : new Error(String(err)));
    }

    const prefix = 'article-meta:';
    const pageIds = (allKeys || [])
        .filter((k) => typeof k === 'string' && k.startsWith(prefix))
        .map((k) => k.slice(prefix.length));

    if (pageIds.length === 0) return callback(null, []);
    const articles = [];
    let pending = pageIds.length;

    for (const pageId of pageIds) {
      getArticleManifest(gid, pageId, (err, manifest) => {
        if (!err && manifest && manifest.title) {
          articles.push(manifest);
        }
        if (--pending === 0) callback(null, articles);
      });
    }
  });
}

module.exports = {
  getContentAtTimestamp,
  getArticleActiveYears,
  listArticles,
};
