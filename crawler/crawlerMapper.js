function mapPage(key, value, ctx) {
  const req = globalThis.__workerRequire;
  const fetcher = req(ctx.fetchPath);
  const store = globalThis.distribution.local.store;
  const now = new Date().toISOString();

  function makePage(title, depth, from, extra) {
    return Object.assign({
      status: 'pending',
      retries: 0,
      claimedAt: null,
      storedAt: null,
      pageId: null,
      revisionCount: 0,
      linkCount: 0,
      historyTruncated: false,
      lastError: null,
      title: fetcher.normalizeDisplayTitle(title),
      depth: depth,
      discoveredFrom: from,
      enqueuedAt: now,
    }, extra || {});
  }

  if (!value || value.status !== 'pending') return [];

  console.log('[worker] fetching: ' + value.title);

  const working = Object.assign({}, value, {status: 'inflight', claimedAt: now, lastError: null});
  store.put(working, {gid: ctx.crawlGid, key: key}, () => {});

  try {
    const result = fetcher.fetchAndStoreRevisions(value.title, ctx.wikiGid, ctx.fetchOptions);

    store.put(makePage(value.title, value.depth, value.discoveredFrom, {
      status: 'stored',
      retries: value.retries,
      claimedAt: now,
      storedAt: now,
      pageId: result.pageId,
      revisionCount: result.revisionCount,
      linkCount: (result.links || []).length,
      historyTruncated: Boolean(result.truncated),
    }), {gid: ctx.crawlGid, key: key}, () => {});

    console.log('[worker] done: ' + value.title + ' revs=' + result.revisionCount + ' segs=' + result.segmentCount + ' links=' + (result.links || []).length);

    const found = [];
    const links = result.links || [];
    for (let i = 0; i < links.length; i++) {
      const title = links[i];
      const littleObj = {};
      littleObj[ctx.pagePrefix + fetcher.getTitleKey(title)] = makePage(title, Number(value.depth || 0) + 1, value.title);
      found.push(littleObj);
    }
    return found;
  } catch (err) {
    console.log('[worker] failed: ' + value.title + ' err=' + (err && err.message ? err.message : String(err)));
    const tries = Number(value.retries || 0) + 1;
    store.put(Object.assign({}, value, {
      status: tries < ctx.maxRetries ? 'pending' : 'failed',
      retries: tries,
      claimedAt: null,
      lastError: err && err.message ? err.message : String(err),
    }), {gid: ctx.crawlGid, key: key}, () => {});
    return [];
  }
}

module.exports = {mapPage};