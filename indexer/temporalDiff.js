#!/usr/bin/env node

const STOP_WORDS = new Set([
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

/**
 * Split text into lowercase tokens, remove stop words and punctuation.
 */
function tokenize(text) {
  if (!text) return [];
  return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w && !STOP_WORDS.has(w) && w.length > 2);
}

/**
 * Aggregate per-article entries into a single index record.
 */
function generateYearWordIndex(entries) {
  let added = 0;
  let removed = 0;
  let articlesAdded = 0;
  let articlesRemoved = 0;

  for (const entry of entries) {
    if (entry.added > 0) {
      articlesAdded++;
      added += entry.added;
    }
    if (entry.removed > 0) {
      removed += entry.removed;
      articlesRemoved++;
    }
  }

  return {
    totalAdded: added,
    totalRemoved: removed,
    articleCount: entries.length,
    articlesAdded,
    articlesRemoved,
  };
}

function normalizeStoreError(error) {
  if (!error) return null;
  if (error instanceof Error) return error;
  if (typeof error === 'object') {
    const values = Object.values(error).filter(Boolean);
    if (values.length === 0) return null;
    const first = values[0];
    return first instanceof Error ? first : new Error(String(first));
  }
  return new Error(String(error));
}

/**
 * Mapper function for the MR framework.
 */
function makeIndexMapper() {
  return new Function(`
    return function mapSegment(key, segment) {
      if (!segment || !segment.base) return [];

      var Diff = process.mainModule.require('diff');

      var STOP = {'the':1,'is':1,'a':1,'an':1,'and':1,'or':1,'but':1,'in':1,
        'on':1,'at':1,'to':1,'for':1,'of':1,'with':1,'by':1,'from':1,'as':1,
        'was':1,'were':1,'been':1,'be':1,'have':1,'has':1,'had':1,
        'do':1,'does':1,'did':1,'will':1,'would':1,'could':1,'should':1,
        'it':1,'its':1,'this':1,'that':1,'these':1,'those':1,'not':1,
        'he':1,'she':1,'they':1,'we':1,'you':1,'i':1,'me':1,'my':1,
        'are':1,'am':1,'also':1,'can':1,'may':1,'so':1,'than':1,'then':1,
        'who':1,'which':1,'what':1,'where':1,'when':1,'how':1,'all':1,
        'each':1,'every':1,'both':1,'few':1,'more':1,'most':1,'other':1,
        'some':1,'such':1,'no':1,'nor':1,'only':1,'own':1,'same':1,
        'about':1,'up':1,'out':1,'if':1,'into':1,'through':1,'during':1,
        'before':1,'after':1,'above':1,'below':1,'between':1,'because':1,
        'until':1,'while':1,'just':1,'over':1,'under':1,'again':1,'further':1,
        'once':1,'here':1,'there':1,'any':1,'very':1,'too':1,'being':1};

      function tok(text) {
        if (!text) return [];
        return text.toLowerCase().replace(/[^a-z0-9\\s]/g, ' ')
          .split(/\\s+/).filter(function(w) { return w && !STOP[w] && w.length > 2; });
      }

      var revs = [{ ts: segment.base.timestamp, content: segment.base.content || '' }];
      var content = segment.base.content || '';
      var deltas = segment.deltas || [];
      for (var d = 0; d < deltas.length; d++) {
        var patched = Diff.applyPatch(content, deltas[d].patch);
        if (patched !== false) content = patched;
        revs.push({ ts: deltas[d].timestamp, content: content });
      }

      if (revs.length < 2) return [];

      var agg = {};
      var title = segment.title || '';

      for (var r = 0; r < revs.length - 1; r++) {
        var year = new Date(revs[r + 1].ts).getUTCFullYear();
        var changes = Diff.diffWords(revs[r].content, revs[r + 1].content, {ignoreCase: true});

        for (var c = 0; c < changes.length; c++) {
          var ch = changes[c];
          if (!ch.added && !ch.removed) continue;
          var words = tok(ch.value);
          for (var w = 0; w < words.length; w++) {
            var yw = year + ':' + words[w];
            if (!agg[yw]) agg[yw] = { article: title, added: 0, removed: 0 };
            if (ch.added)   agg[yw].added   += 1;
            if (ch.removed) agg[yw].removed += 1;
          }
        }
      }

      var out = [];
      var keys = Object.keys(agg);
      for (var k = 0; k < keys.length; k++) {
        var entry = {};
        entry[keys[k]] = agg[keys[k]];
        out.push(entry);
      }
      return out;
    };
  `)();
}

/**
 * Build a self-contained reducer for the MR framework.
 * Aggregates per-article year:word entries into index records.
 */
function makeIndexReducer() {
  return new Function(`
    return function reduceYearWord(key, values) {
      var added = 0, removed = 0, articlesAdded = 0, articlesRemoved = 0;
      var vals = Array.isArray(values) ? values : [values];
      for (var i = 0; i < vals.length; i++) {
        var v = vals[i];
        if (!v) continue;
        if (v.added > 0)   { added += v.added;   articlesAdded++; }
        if (v.removed > 0) { removed += v.removed; articlesRemoved++; }
      }
      var result = {};
      result[key] = {
        totalAdded: added,
        totalRemoved: removed,
        articleCount: vals.length,
        articlesAdded: articlesAdded,
        articlesRemoved: articlesRemoved
      };
      return result;
    };
  `)();
}

/**
 * List all article-segment keys in the store.
 */
function listSegmentKeys(gid, callback) {
  const service = globalThis.distribution && globalThis.distribution[gid];
  if (!service || !service.store) {
    return callback(new Error(`group not found: ${gid}`));
  }

  service.store.get({key: null, gid}, (err, allKeys) => {
    if (err instanceof Error) return callback(err);

    const prefix = 'article-segment:';
    const segKeys = (allKeys || [])
        .filter((k) => typeof k === 'string' && k.startsWith(prefix));

    callback(null, segKeys);
  });
}

/**
 * Build the temporal diff index using distributed MapReduce.
 *
 * Map:    Each segment -> diff consecutive revisions -> emit year:word entries
 * Reduce: Aggregate year:word entries across all segments/articles
 * Post:   Write aggregated diff:year:word records to the store
 */
function buildDistributedIndex(gid, callback) {
  if (typeof callback !== 'function') callback = () => {};

  const service = globalThis.distribution && globalThis.distribution[gid];
  if (!service || !service.store || !service.mr) {
    return callback(new Error(`group not found or missing mr: ${gid}`));
  }

  console.log('[indexer] listing segment keys...');

  listSegmentKeys(gid, (listErr, segKeys) => {
    if (listErr) return callback(listErr);
    if (!segKeys || segKeys.length === 0) {
      return callback(new Error('no segments found in store'));
    }

    console.log(`[indexer] found ${segKeys.length} segments, starting MapReduce...`);

    service.mr.exec({
      keys: segKeys,
      map: makeIndexMapper(),
      reduce: makeIndexReducer(),
    }, (mrErr, results) => {
      if (mrErr) return callback(normalizeStoreError(mrErr));

      if (!results || results.length === 0) {
        console.log('[indexer] MapReduce produced no results');
        return callback(null, 0);
      }

      console.log(`[indexer] MapReduce done, writing ${results.length} index entries...`);

      let i = 0;
      let written = 0;

      function nextWrite() {
        if (i >= results.length) {
          console.log(`[indexer] stored ${written} diff:year:word entries`);
          return callback(null, written);
        }

        const obj = results[i++];
        if (!obj || typeof obj !== 'object') return nextWrite();

        const keys = Object.keys(obj);
        if (keys.length === 0) return nextWrite();

        const yw = keys[0];
        const value = obj[yw];

        service.store.put(value, {key: `diff:${yw}`, gid}, (putErr) => {
          const normalized = normalizeStoreError(putErr);
          if (normalized) return callback(normalized);
          written++;
          if (written % 500 === 0) console.log(`[indexer]   wrote ${written}...`);
          nextWrite();
        });
      }
      nextWrite();
    });
  });
}

module.exports = {
  buildDistributedIndex,
  tokenize,
  generateYearWordIndex,
};


if (require.main === module) {
  const {connectToCluster, shutdown, getArg} = require('../lib/clusterConnect');

  const gid = getArg('--gid', 'wiki');

  (async () => {
    let dist;
    try {
      dist = await connectToCluster({
        nodesFile: getArg('--nodes-file', null),
        gid,
        port: parseInt(getArg('--port', '7999'), 10),
        ip: getArg('--ip', null),
        propagate: true,
      });
    } catch (err) {
      console.error('Failed to connect:', err.message);
      process.exit(1);
    }

    console.log(`[indexer] group: ${gid}`);

    buildDistributedIndex(gid, async (err, count) => {
      if (err) {
        console.error('[indexer] Error:', err.message);
        await shutdown(dist);
        process.exit(1);
      }
      console.log(`[indexer] done. ${count} year:word index entries built.`);
      await shutdown(dist);
      process.exit(0);
    });
  })();
}
