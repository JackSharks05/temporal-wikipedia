#!/usr/bin/env node

const Diff = require('diff');
const {
  listArticles,
  getArticleActiveYears,
  getContentAtTimestamp,
} = require('../storage/getArticle.js');

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
 * Diff consecutive year-end snapshots and produce year:word entries.
 * Returns a plain object keyed by "year:word".
 */
function diffSnapshots(title, activeYears, snapshots) {
  const entries = Object.create(null);

  for (let i = 0; i < activeYears.length - 1; i++) {
    const changes = Diff.diffWords(snapshots[i], snapshots[i + 1], {ignoreCase: true});

    const added = {};
    const removed = {};

    for (const segment of changes) {
      if (!segment.added && !segment.removed) continue;
      const words = tokenize(segment.value);
      for (const word of words) {
        if (segment.added) {
          added[word] = (added[word] || 0) + 1;
        } else if (segment.removed) {
          removed[word] = (removed[word] || 0) + 1;
        }
      }
    }

    const changedWords = new Set([...Object.keys(removed), ...Object.keys(added)]);
    for (const word of changedWords) {
      entries[`${activeYears[i + 1]}:${word}`] = {
        article: title,
        added: added[word] || 0,
        removed: removed[word] || 0,
      };
    }
  }

  return entries;
}

/**
 * For one article: find active years, fetch year-end snapshots, then diff them.
 */
function getYearWordCounts(gid, manifest, title, callback) {
  getArticleActiveYears(gid, manifest, (err, activeYears) => {
    if (err) return callback(err);
    if (!activeYears || activeYears.length < 2) return callback(null, {});

    const snapshots = new Array(activeYears.length);
    let pending = activeYears.length;

    for (let i = 0; i < activeYears.length; i++) {
      const timestamp = `${activeYears[i]}-12-31T23:59:59Z`;
      getContentAtTimestamp(gid, manifest, timestamp, (snapErr, result) => {
        snapshots[i] = (result && result.content) ? result.content : '';
        if (--pending === 0) {
          callback(null, diffSnapshots(title, activeYears, snapshots));
        }
      });
    }
  });
}


// going to transition this to use map reduce
/**
 * Build the temporal diff index over all stored articles.
 * Enumerates articles, fetches year-end snapshots, diffs them,
 * and writes diff:year:word records to the store.
 */
function buildTemporalDiffIndex(gid, callback) {
  if (typeof callback !== 'function') callback = () => {};

  const service = globalThis.distribution && globalThis.distribution[gid];
  if (!service || !service.store) {
    return callback(new Error(`group not found: ${gid}`));
  }

  listArticles(gid, (listErr, manifests) => {
    if (listErr) return callback(listErr);
    if (!manifests || manifests.length === 0) {
      return callback(new Error('no articles found'));
    }

    let completed = false;

    const finishWithError = (error) => {
      if (completed) return;
      completed = true;
      callback(error);
    };

    console.log(`Building temporal diff index for ${manifests.length} articles`);

    const grouped = Object.create(null);
    let i = 0;

    function nextArticle() {
      if (i >= manifests.length) {
        writeIndexes();
        return;
      }
      const manifest = manifests[i++];
      getYearWordCounts(gid, manifest, manifest.title, (diffErr, entries) => {
        if (diffErr) {
          console.error(`  skipping ${manifest.title}: ${diffErr.message}`);
        } else {
          for (const [key, value] of Object.entries(entries)) {
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(value);
          }
        }
        console.log(`  [${i}/${manifests.length}] ${manifest.title}`);
        nextArticle();
      });
    }
    nextArticle();

    function writeIndexes() {
      const yearWords = Object.keys(grouped);
      if (yearWords.length === 0) {
        completed = true;
        return callback(null, 0);
      }

      console.log(`Writing ${yearWords.length} year:word entries...`);
      let wi = 0;

      function nextWrite() {
        if (wi >= yearWords.length) {
          if (!completed) {
            completed = true;
            console.log(`[yearlyDiff] Stored ${yearWords.length} year:word entries`);
            callback(null, yearWords.length);
          }
          return;
        }
        const yw = yearWords[wi++];
        const value = generateYearWordIndex(grouped[yw]);

        service.store.put(value, {key: `diff:${yw}`, gid}, (putErr) => {
          const normalizedPutErr = normalizeStoreError(putErr);
          if (normalizedPutErr) return finishWithError(normalizedPutErr);
          if (wi % 500 === 0) console.log(`  wrote ${wi}/${yearWords.length}`);
          nextWrite();
        });
      }
      nextWrite();
    }
  });
}

module.exports = {buildTemporalDiffIndex, tokenize, generateYearWordIndex};

if (require.main === module) {
  const distribution = require('../distribution');

  function getArg(name, fallback = null) {
    const index = process.argv.indexOf(name);
    if (index === -1 || index + 1 >= process.argv.length) return fallback;
    return process.argv[index + 1];
  }

  const gid = getArg('--gid', 'all');
  const port = parseInt(getArg('--port', '9000'), 10);
  const ip = getArg('--ip', '127.0.0.1');

  console.log(`Connecting to ${ip}:${port}, group: ${gid}`);

  const dist = distribution({ip, port});

  function finish(code) {
    dist.local.status.stop(() => process.exit(code));
  }

  dist.node.start((server) => {
    if (server instanceof Error) {
      console.error(server);
      return finish(1);
    }

    buildTemporalDiffIndex(gid, (err, count) => {
      if (err) {
        console.error('Error:', err.message);
        return finish(1);
      }

      console.log(`Done. ${count} year:word index entries built.`);
      finish(0);
    });
  });
}
