

const Diff = require('diff');
const {reconstructAtDate, extractPlainText} = require('../crawler/crawler');

/** @typedef {import("../types.js").Article} Article */

/**
 * @typedef {Object} TimeDiffEntry
 * @property {string} article
 * @property {number} added
 * @property {number} removed
 */


/**
 * @typedef {Object} TimeDiffIndex
 * @property {number} totalAdded
 * @property {number} totalRemoved
 * @property {number} articleCount
 * @property {number} articlesAdded
 * @property {number} articlesRemoved
 */

// random words probably don't care about
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


// these helpers can proably be placed in a shared place

/**
 * Split text into white space separated, remove stop words, make lowercase, remove punctuation
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => !STOP_WORDS.has(w));
}


/**
 * Find years where there was a diff in article
 * @param {Article} article
 * @returns {number[]}
 */
function getActiveYears(article) {
  const years = new Set()
  years.add(new Date(article.base.timestamp).getFullYear());
  for (const delta of article.deltas) {
    years.add(new Date(delta.timestamp).getFullYear());
  }
  return [...years].sort((a, b) => (a - b));
}


/**
 * @param {string} articleKey
 * @param {Article} article
 * @returns { {[key: string]: TimeDiffEntry}[]}
 */
const getYearWordCounts = (articleKey, article) => {
  const entries = [];
  const activeYears = getActiveYears(article);
  let curTxt = reconstructAtDate(article, activeYears[0]);
  for (let i = 0; i < activeYears.length - 1; i++) {
    const nextTxt = reconstructAtDate(article, activeYears[i+1]);
    const changes = Diff.diffWords(curTxt, nextTxt, { ignoreCase: true });

    const added = {}
    const removed = {}

    for (const segment of changes) {
      if (!segment.added && !segment.removed) {
        continue;
      }
      const words = tokenize(segment.value);
      for (const word of words) {
        if (segment.added) {
          added[word] = (added[word] || 0) + 1;
        } else if (segment.removed) {
          removed[word] = (removed[word] || 0) + 1;
        }
      }
    }

    const diff = new Set([...Object.keys(removed), ...Object.keys(added)]);

    for (const word of diff) {
      const adds = added[word] || 0
      const removes = removed[word] || 0
      entries.push(
        {
          [`${activeYears[i]}:${word}`]: {
            article: article.title,
            added: adds,
            removed: removes,
          }
        }
      )
    }
    
    curTxt = nextTxt;
  }

  return entries;
}

/**
 * Generates an index at year:word
 * @param {string} yearWord
 * @param {TimeDiffEntry[]} entries
 * @returns {{ [key: string]: TimeDiffIndex }}
 */
const generateYearWordIndex = (yearWord, entries) => {
  let added = 0;
  let removed = 0;
  let articlesAdded = 0;
  let articlesRemoved = 0;

  for (const entry of entries) {
    if (entry.added > 0) {
      articlesAdded += 1;
      added += entry.added;
    }
    if (entry.removed > 0) {
      removed += entry.removed;
      articlesRemoved += 1;
    }

  }

  return {
    [yearWord]: {
      totalAdded: added,
      totalRemoved: removed,
      articleCount: entries.length,
      articlesAdded: articlesAdded,
      articlesRemoved: articlesRemoved,
    }
  }
}


function buildTemporalDiffIndex(gid, callback) {

  globalThis.distribution[gid].store.get({ key: null, gid: gid }, (getErr, allKeys) => {
    if (getErr) {
      return callback(getErr);
    }
    const articleKeys = allKeys.filter((k) => k.startsWith("article:"));
    if (articleKeys.length == 0) {
      return callback(Error("no articles found "))
    }

    console.log(`Building temporal diff index for ${articleKeys.length} articles`);

    globalThis.distribution[gid].mr.exec(
      {
        keys: articleKeys,
        map: getYearWordCounts,
        reduce: generateYearWordIndex,
      },
      (e, results) => {
        if (e) {
          return callback(e);
        }
        if (!results || results.length === 0) {
            return callback(null, []);
        }
        let pending = results.length;
        for (const result of results) {
          const key = Object.keys(result)[0];
          const value = result[key];
          globalThis.distribution[gid].store.put(
            value,
            { key: `diff:${key}`, gid },
            (putErr) => {
              if (putErr) console.error(`[yearlyDiff] Failed to store diff:${key}`, putErr);
              if (--pending === 0) {
                console.log(`[yearlyDiff] Stored ${results.length} entries.`);
                callback(null, results);
              }
            },
          );
        }
      }
    )
  })
}

module.exports = { buildTemporalDiffIndex }