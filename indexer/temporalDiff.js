/* BEGIN COPIED FROM KE implementation progress: temporal-wikipedia/temporal-wikipedia-ke-implementation-progress/indexer/temporalDiff.js */
const Diff = require('diff');
const {reconstructAtDate} = require('../crawler/crawler');

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
  const years = new Set();
  years.add(new Date(article.base.timestamp).getUTCFullYear()); // NEW: Bucket revision history by UTC year so midnight-Z timestamps do not slip into the prior local year.
  for (const delta of article.deltas) {
    years.add(new Date(delta.timestamp).getUTCFullYear()); // NEW: Use the same UTC-year rule for every delta timestamp.
  }
  return [...years].sort((a, b) => (a - b));
}


/**
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
    },
  };
};
/* END COPIED FROM KE implementation progress: temporal-wikipedia/temporal-wikipedia-ke-implementation-progress/indexer/temporalDiff.js */

/* BEGIN NEW CODE WRITTEN FOR THE MERGED WORKSPACE */
/**
 * Treat the distributed store's empty error-map response as success. // NEW: The merged store returns `{}` for successful fan-out key scans.
 * @param {any} error // NEW: Accept the heterogeneous callback error shape used by the distribution library.
 * @returns {Error | null} // NEW: Normalize to either a real Error or null.
 */
function normalizeStoreError(error) { // NEW: This adapter keeps the project indexer compatible with the merged distribution store API.
  if (!error) return null; // NEW: Nullish values already mean success.
  if (error instanceof Error) return error; // NEW: Preserve direct Error objects.
  if (typeof error === 'object') { // NEW: Fan-out store operations can return an object keyed by node id.
    const values = Object.values(error).filter(Boolean); // NEW: Empty objects should not be treated as failures.
    if (values.length === 0) return null; // NEW: `{}` means no node reported an error.
    const first = values[0]; // NEW: Surface the first real node-level error.
    return first instanceof Error ? first : new Error(String(first)); // NEW: Re-wrap non-Error values defensively.
  }
  return new Error(String(error)); // NEW: Normalize any unexpected callback error shape.
}

/**
 * Convert reconstructAtDate's object return value into plain content for diffing. // NEW: The copied indexer passed the whole object into `diffWords`.
 * @param {Article} article // NEW: Index entries are derived from one article history at a time.
 * @param {number} year // NEW: Years come from `getActiveYears`.
 * @returns {string} // NEW: `diffWords` expects strings, not `{content, timestamp}` objects.
 */
function getContentAtYear(article, year) { // NEW: Centralizes the date-to-content fix so the copied diff logic stays small.
  const snapshot = reconstructAtDate(article, `${year}-12-31T23:59:59Z`); // NEW: Compare each year against the article as of that year's end.
  return snapshot ? snapshot.content : ''; // NEW: Missing snapshots should behave like empty text.
}

/**
 * @param {string} articleKey // NEW: Keep the original mapper signature shape even though the merged version executes locally.
 * @param {Article} article // NEW: The article object comes straight from the distributed store.
 * @returns {{[key: string]: TimeDiffEntry}[]} // NEW: Preserve the output format expected by the copied reducer.
 */
const getYearWordCounts = (articleKey, article) => { // NEW: This is the copied mapper logic with the reconstructAtDate bug fixed.
  if (!article || !article.base || !Array.isArray(article.deltas)) return []; // NEW: Guard against partially stored article records.
  const entries = []; // NEW: Keep the same emitted-entry format used by the snapshot code.
  const activeYears = getActiveYears(article); // NEW: Reuse the copied year bucketing behavior.
  if (activeYears.length < 2) return entries; // NEW: A single active year has no inter-year drift to index.
  let curTxt = getContentAtYear(article, activeYears[0]); // NEW: Use actual text content rather than the full snapshot object.
  for (let i = 0; i < activeYears.length - 1; i++) { // NEW: Preserve the original "year to next year" comparison.
    const nextTxt = getContentAtYear(article, activeYears[i + 1]); // NEW: Compare end-of-year snapshots as strings.
    const changes = Diff.diffWords(curTxt, nextTxt, {ignoreCase: true}); // NEW: This now receives strings and works correctly.

    const added = {}; // NEW: Keep the original word aggregation structure.
    const removed = {}; // NEW: Keep the original word aggregation structure.

    for (const segment of changes) { // NEW: Copied diff aggregation logic.
      if (!segment.added && !segment.removed) { // NEW: Skip unchanged segments.
        continue; // NEW: No contribution to semantic drift for stable text.
      }
      const words = tokenize(segment.value); // NEW: Reuse the copied tokenization pipeline.
      for (const word of words) { // NEW: Count added and removed tokens separately.
        if (segment.added) { // NEW: Preserve the snapshot's added-count semantics.
          added[word] = (added[word] || 0) + 1; // NEW: Increment additions per word.
        } else if (segment.removed) { // NEW: Preserve the snapshot's removed-count semantics.
          removed[word] = (removed[word] || 0) + 1; // NEW: Increment removals per word.
        }
      }
    }

    const diff = new Set([...Object.keys(removed), ...Object.keys(added)]); // NEW: Emit one entry per changed word.

    for (const word of diff) { // NEW: Preserve the original emitted key format.
      const adds = added[word] || 0; // NEW: Default missing counts to zero.
      const removes = removed[word] || 0; // NEW: Default missing counts to zero.
      entries.push({ // NEW: Keep the reducer input structure identical to the snapshot's design.
        [`${activeYears[i]}:${word}`]: {
          article: article.title || articleKey, // NEW: Fall back to the storage key if title is absent.
          added: adds,
          removed: removes,
        },
      });
    }

    curTxt = nextTxt; // NEW: Advance the comparison window exactly as the copied mapper intended.
  }

  return entries; // NEW: Return per-article emitted entries for later aggregation.
};

/**
 * Load each stored article, compute year-word drift locally, and store the resulting temporal index. // NEW: This avoids the copied MR closure-serialization issue.
 * @param {string} gid // NEW: The distribution group to read from and write into.
 * @param {(error: Error | null, results?: {[key: string]: TimeDiffIndex}[]) => void} callback // NEW: Match the snapshot callback style.
 */
function buildTemporalDiffIndex(gid, callback) { // NEW: Reimplemented orchestration so the snapshot logic actually runs on the merged library.
  if (typeof callback !== 'function') callback = () => {}; // NEW: Maintain the library's callback-defaulting style.
  const service = globalThis.distribution && globalThis.distribution[gid]; // NEW: Resolve the target distribution service once.
  if (!service || !service.store) { // NEW: Fail fast if the caller did not initialize the group.
    return callback(new Error(`group not found: ${gid}`)); // NEW: Give a concrete integration error instead of crashing on undefined access.
  }

  service.store.get({key: null, gid: gid}, (getErr, allKeys) => { // NEW: Reuse the snapshot's stored-key discovery step.
    const normalizedGetErr = normalizeStoreError(getErr); // NEW: Interpret `{}` as success for the merged store implementation.
    if (normalizedGetErr) { // NEW: Surface genuine fan-out errors.
      return callback(normalizedGetErr); // NEW: Abort before doing partial index work.
    }

    const articleKeys = (allKeys || []).filter((k) => typeof k === 'string' && k.startsWith('article:')); // NEW: Keep the snapshot's key-selection convention.
    if (articleKeys.length === 0) { // NEW: Preserve the original explicit empty-store failure mode.
      return callback(new Error('no articles found ')); // NEW: Keep the existing message so callers see familiar behavior.
    }

    console.log(`Building temporal diff index for ${articleKeys.length} articles`); // NEW: Preserve the snapshot's progress log.

    const groupedEntries = Object.create(null); // NEW: Aggregate mapper output by `year:word`.
    let pendingGets = articleKeys.length; // NEW: Track asynchronous store reads.
    let completed = false; // NEW: Prevent duplicate callback invocations.

    const finishWithError = (error) => { // NEW: Shared early-exit helper for async failures.
      if (completed) return; // NEW: Only fail once.
      completed = true; // NEW: Latch completion before invoking the callback.
      callback(error); // NEW: Surface the first read or write failure.
    };

    const maybeWriteIndexes = () => { // NEW: Start the write phase only after every article has been loaded and diffed.
      if (completed || pendingGets !== 0) return; // NEW: Wait until all fetches have resolved.
      const yearWords = Object.keys(groupedEntries); // NEW: One stored record per `year:word`.
      if (yearWords.length === 0) { // NEW: Articles may exist without any inter-year text drift.
        completed = true; // NEW: Mark success before invoking the callback.
        return callback(null, []); // NEW: Mirror the snapshot's empty-result success case.
      }

      const results = yearWords.map((yearWord) => generateYearWordIndex(yearWord, groupedEntries[yearWord])); // NEW: Reuse the copied reducer to build final index rows.
      let pendingPuts = results.length; // NEW: Track distributed writes of the finished index rows.

      for (const result of results) { // NEW: Store each reducer output under the original `diff:` key scheme.
        const key = Object.keys(result)[0]; // NEW: Reducer output is a single-key object keyed by `year:word`.
        const value = result[key]; // NEW: Persist just the index payload under `diff:${year:word}`.
        service.store.put(value, {key: `diff:${key}`, gid}, (putErr) => { // NEW: Keep the original storage layout from the snapshot code.
          const normalizedPutErr = normalizeStoreError(putErr); // NEW: Defensive normalization for any fan-out error shape.
          if (normalizedPutErr) { // NEW: Abort if any index row fails to store.
            return finishWithError(normalizedPutErr); // NEW: Surface the write failure immediately.
          }
          pendingPuts -= 1; // NEW: Count down successful writes.
          if (pendingPuts === 0 && !completed) { // NEW: Only finish once every result has been stored.
            completed = true; // NEW: Latch completion before logging and returning.
            console.log(`[yearlyDiff] Stored ${results.length} entries.`); // NEW: Preserve the snapshot's completion log.
            callback(null, results); // NEW: Return the same result shape the snapshot intended.
          }
        });
      }
    };

    for (const articleKey of articleKeys) { // NEW: Fetch every stored article before aggregating drift.
      service.store.get({key: articleKey, gid}, (articleErr, article) => { // NEW: Load article histories through the merged distributed store.
        const normalizedArticleErr = normalizeStoreError(articleErr); // NEW: Handle the store's heterogeneous callback error contract.
        if (normalizedArticleErr) { // NEW: Stop on any failed article read.
          return finishWithError(normalizedArticleErr); // NEW: Avoid building partial temporal indexes silently.
        }

        const entries = getYearWordCounts(articleKey, article); // NEW: Run the repaired mapper locally so closures and imports work.
        for (const entry of entries) { // NEW: Group per-article emissions by the final `year:word` key.
          const key = Object.keys(entry)[0]; // NEW: Every mapper emission is a single-key object.
          if (!groupedEntries[key]) groupedEntries[key] = []; // NEW: Initialize each bucket on first use.
          groupedEntries[key].push(entry[key]); // NEW: Accumulate reducer inputs under the shared `year:word` bucket.
        }

        pendingGets -= 1; // NEW: Count down this article fetch.
        maybeWriteIndexes(); // NEW: Enter the write phase once the last article has been processed.
      });
    }
  });
}
/* END NEW CODE WRITTEN FOR THE MERGED WORKSPACE */

module.exports = {buildTemporalDiffIndex};
