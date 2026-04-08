const Diff = require('diff');

const DEFAULT_SEGMENT_SIZE = 50;

function normalizeTitle(title) {
  return String(title || '').trim().replace(/\s+/g, '_').toLowerCase();
}

function sortRevisions(revisions) {
  return revisions.filter((revision) => revision && revision.revId && revision.timestamp)
      .map((revision) => ({
        revId: String(revision.revId), parentId: revision.parentId ? String(revision.parentId) : '', timestamp: String(revision.timestamp), content: revision.content || ''}))
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

function expandEncodedArticle(article) {
  if (!article || !article.base) return [];

  const revisions = [{
    revId: String(article.base.revId),
    parentId: article.base.parentId ? String(article.base.parentId) : '',
    timestamp: String(article.base.timestamp),
    content: article.base.content || '',
  }];

  let content = article.base.content || '';
  for(const delta of article.deltas || []) {
    const patched = Diff.applyPatch(content, delta.patch);
    if (patched === false) {
      throw new Error(`could not apply patch for revision ${delta.revId}`);
    }
    content = patched;
    revisions.push({
      revId: String(delta.revId),
      parentId: delta.parentId ? String(delta.parentId) : '',
      timestamp: String(delta.timestamp),
      content,
    });
  }

  return revisions;
}

function getArticleRevisions(article) {
  if (Array.isArray(article.revisions)) {
    return sortRevisions(article.revisions);
  }
  return sortRevisions(expandEncodedArticle(article));
}

function createSegment(pageId,title,segmentId,revisions) {
  const baseRevision = revisions[0];
  const deltas = [];

  for (let i = 1; i < revisions.length; i++) {
    const previous = revisions[i - 1];
    const current = revisions[i];
    deltas.push({
      revId: current.revId,
      parentId: current.parentId,
      timestamp: current.timestamp,
      patch: Diff.createPatch(
          `rev-${current.revId}`,
          previous.content || '',
          current.content || '',
          previous.timestamp,
          current.timestamp,
      ),
    });
  }


  const lastRevision = revisions[revisions.length - 1];
  return {
    pageId,
    title,
    segmentId,
    base: {
      revId: baseRevision.revId,
      parentId: baseRevision.parentId,
      timestamp: baseRevision.timestamp,
      content: baseRevision.content || '',
    },
    deltas,
    startRevId: baseRevision.revId,
    endRevId: lastRevision.revId,
    startTimestamp: baseRevision.timestamp,
    endTimestamp: lastRevision.timestamp,
    revisionCount: revisions.length,
  };
}

function segmentArticle(article,segmentSize = DEFAULT_SEGMENT_SIZE) {
  if (!article || !article.pageId || !article.title) {
    throw new Error('segmentArticle: article requires pageId and title');
  }
  if (!Number.isInteger(segmentSize) || segmentSize <= 0) {
    throw new Error('segmentArticle: segmentSize must be a positive integer');
  }

  const pageId = String(article.pageId);
  const title = String(article.title);
  const revisions = getArticleRevisions(article);
  if (revisions.length === 0) {
    throw new Error(`segmentArticle: no revisions for ${title}`);
  }

  const segments = [];
  for (let start = 0; start < revisions.length; start += segmentSize) {
    const chunk = revisions.slice(start, start + segmentSize);
    segments.push(createSegment(pageId, title, segments.length, chunk));
  }

  const firstRevision = revisions[0];
  const latestRevision = revisions[revisions.length - 1];
  const manifestSegments = segments.map((segment) => ({
    segmentId: segment.segmentId,
    startRevId: segment.startRevId,
    endRevId: segment.endRevId,
    startTimestamp: segment.startTimestamp,
    endTimestamp: segment.endTimestamp,
    revisionCount: segment.revisionCount,
  }));

  const meta = {
    pageId,
    title,
    latestRevId: latestRevision.revId,
    firstTimestamp: firstRevision.timestamp,
    latestTimestamp: latestRevision.timestamp,
    revisionCount: revisions.length,
    segmentCount: segments.length,
    segmentSize,
  };

  const manifest = {pageId,title,segmentSize,segments:manifestSegments};

  return {titleRecord:{pageId,title},meta,manifest,segments};
}

module.exports = {DEFAULT_SEGMENT_SIZE,normalizeTitle,segmentArticle};
