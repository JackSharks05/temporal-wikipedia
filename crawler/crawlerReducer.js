function reducePage(key, values, ctx) {
  const store = globalThis.distribution.local.store;
  let stuff = Array.isArray(values) ? values : [values];
  stuff = stuff.filter(Boolean);
  let current = null;
  let best = null;

  store.get({gid: ctx.crawlGid, key: key}, (err, val) => {
    if (!err) current = val;
  });

  for (let i = 0; i < stuff.length; i++) {
    const v = stuff[i];
    if (!best || Number(v.depth || 0) < Number(best.depth || 0)) best = v;
  }

  if (!best) return null;
  if (Number(best.depth || 0) > ctx.maxDepth) return null;

  if (!current) {
    store.put(best, {gid: ctx.crawlGid, key: key}, () => {});
    return null;
  }

  if (current.status === 'pending' && Number(best.depth || 0) < Number(current.depth || 0)) {
    store.put(
      Object.assign({}, current, {
        depth: best.depth,
        discoveredFrom: best.discoveredFrom,
        enqueuedAt: best.enqueuedAt,
      }),
      {gid: ctx.crawlGid, key: key},
      () => {},
    );
  }
  return null;
}

module.exports = {reducePage};