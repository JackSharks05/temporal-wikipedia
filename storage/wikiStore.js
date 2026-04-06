const {
  DEFAULT_SEGMENT_SIZE,
  normalizeTitle,
  segmentArticle,
} = require('./segmentArticle');

const keyForTitle = (title)=> `article-title:${normalizeTitle(title)}`;
const keyForMeta = (pageId)=> `article-meta:${pageId}`;
const keyForManifest = (pageId)=> `article-manifest:${pageId}`;
const keyForSegment = (pageId, segmentId)=> `article-segment:${pageId}:${segmentId}`;

function normalizeStoreError(error) {
  if (!error){
    return null;
  }
  if (error instanceof Error) return error;
  if (typeof error === 'object' && Object.keys(error).length === 0) return null;
  return new Error(String(error));
}

const getStore = (gid) => globalThis.distribution[gid].store;

function putAll(store,gid,writes,callback) {
  let index = 0;
  const next = () => {
    if (index >= writes.length) return callback(null);
    const write = writes[index];
    index += 1;
    store.put(write.value,{gid,key:write.key}, (error) => {
      const normalized = normalizeStoreError(error);
      if (normalized) return callback(normalized);
      next();
    });
  };
  next();
}

function storeArticle(gid,article,callback,options = {}) {
  if (typeof callback !== 'function') callback = () => {};

  const encoded = segmentArticle(article, options.segmentSize || DEFAULT_SEGMENT_SIZE);
  const pageId = encoded.meta.pageId;
  const writes = [];

  writes.push({key:keyForTitle(encoded.meta.title),value:encoded.titleRecord});
  writes.push({key:keyForMeta(pageId),value:encoded.meta});
  writes.push({key:keyForManifest(pageId),value:encoded.manifest});

  for (let i = 0; i < encoded.segments.length; i++) {
    const segment = encoded.segments[i];
    writes.push({key:keyForSegment(pageId,segment.segmentId),value:segment});
  }

  putAll(getStore(gid),gid,writes,(error) => {
    if (error) return callback(error);
    callback(null,encoded.meta);
  });
}

function getKey(gid,key,callback) {
  getStore(gid).get({gid,key},(error,value) => {
    callback(normalizeStoreError(error),value);
  });
}

const getArticleMeta = (gid,pageId,cb) => getKey(gid,keyForMeta(pageId),cb);
const getArticleManifest = (gid,pageId,cb) => getKey(gid,keyForManifest(pageId),cb);
const getArticleSegment = (gid,pageId,segmentId,cb) => getKey(gid,keyForSegment(pageId, segmentId),cb);
const getPageIdForTitle = (gid,title,cb) => getKey(gid,keyForTitle(title),cb);

module.exports = {
  keyForTitle,
  keyForMeta,
  keyForManifest,
  keyForSegment,
  normalizeTitle,
  storeArticle,
  getArticleMeta,
  getArticleManifest,
  getArticleSegment,
  getPageIdForTitle,
};
