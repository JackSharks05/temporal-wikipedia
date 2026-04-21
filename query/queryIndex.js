const {
  normalizeError: normalizeStoreError,
} = require("../lib/normalizeError");
const { getPageIdForTitle } = require("../storage/wikiStore");

function getDiffEntry(gid, year, word, callback) {
  const store = globalThis.distribution[gid].store;
  store.get({ key: `diff:${year}:${word}`, gid }, (err, value) => {
    callback(normalizeStoreError(err), value);
  });
}

function getStore(gid) {
  return globalThis.distribution[gid].store;
}

function isMissingKeyError(error) {
  return !!(error && error.message && /key not found/i.test(error.message));
}

function getValue(gid, key, callback) {
  getStore(gid).get({ key, gid }, (err, value) => {
    const normalized = normalizeStoreError(err);
    if (isMissingKeyError(normalized)) return callback(null, null);
    callback(normalized, value);
  });
}

function getAllKeys(gid, callback) {
  getStore(gid).get({ key: null, gid }, (err, keys) => {
    callback(normalizeStoreError(err), Array.isArray(keys) ? keys : []);
  });
}

function normalizeWord(word) {
  return (
    word
      .toLowerCase()
      .trim()
      .normalize("NFD") // split accents from letters: do we want this?
      // .replace(/[\u0300-\u036f]/g, "") // remove the accent marks: i don't think we want this
      .replace(/[^a-z0-9]/g, "") // remove non alphanumeric
  );
}

function makeTermKey(word) {
  return `term:${normalizeWord(word)}`;
}

/**
 * active test function
 */
function isActiveAtT(record, queryTimestamp) {
  if (!record || !record.startTime) {
    return false;
  }
  const toEpoch = (t) => {
    if (t == null) return null;
    if (typeof t === "number") return t;
    const parsed = Date.parse(String(t));
    return Number.isNaN(parsed) ? null : parsed;
  };

  const startEpoch = toEpoch(record.startTime);
  const endEpoch = record.endTime == null ? Infinity : toEpoch(record.endTime);
  const queryEpoch = toEpoch(queryTimestamp);

  if (startEpoch == null || queryEpoch == null || endEpoch == null)
    return false;
  return startEpoch <= queryEpoch && queryEpoch < endEpoch;
}

// our get function
function getTemporalPostings(gid, word, callback) {
  if (typeof callback !== "function") {
    throw new TypeError(
      "getTemporalPostings expects (gid, word, callback)",
    );
  }
  if (typeof word !== "string") {
    return callback(new TypeError("word must be a string"), []);
  }

  getStore(gid).get({ key: makeTermKey(word), gid }, (err, value) => {
    const normalizedErr = normalizeStoreError(err);
    if (isMissingKeyError(normalizedErr)) return callback(null, []);
    if (normalizedErr) return callback(normalizedErr);
    if (!Array.isArray(value)) return callback(null, []);
    callback(null, value);
  });
}

// and put function!
function putTemporalPostings(gid, word, postings, callback) {
  getStore(gid).put(postings, { key: makeTermKey(word), gid }, (err, value) => {
    callback(normalizeStoreError(err), value);
  });
}

function getBirthEntry(gid, year, callback) {
  getValue(gid, `birth:${year}`, callback);
}

function getDeathEntry(gid, year, callback) {
  getValue(gid, `death:${year}`, callback);
}

function getDefinitionEntry(gid, year, title, callback) {
  getValue(gid, `definition:${year}:${title}`, callback);
}

function getPageEditFrequency(gid, titleOrPageId, callback) {
  const byPageId = (pageId) => {
    getAllKeys(gid, (err, keys) => {
      if (err) return callback(err);

      const prefix = `editfreq:page:${pageId}:`;
      const yearKeys = keys.filter(
        (k) => typeof k === "string" && k.startsWith(prefix),
      );
      if (yearKeys.length === 0) {
        return callback(null, { pageId, title: null, series: [] });
      }

      const series = [];
      let pending = yearKeys.length;
      let failed = false;

      yearKeys.forEach((k) => {
        getValue(gid, k, (keyErr, value) => {
          if (failed) return;
          if (keyErr) {
            failed = true;
            return callback(keyErr);
          }
          if (value && typeof value === "object") {
            series.push({
              year: Number(value.year),
              edits: Number(value.edits) || 0,
            });
          }
          pending -= 1;
          if (pending === 0) {
            series.sort((a, b) => a.year - b.year);
            callback(null, { pageId, title: null, series });
          }
        });
      });
    });
  };

  if (/^\d+$/.test(String(titleOrPageId))) {
    return byPageId(String(titleOrPageId));
  }

  getPageIdForTitle(gid, titleOrPageId, (err, titleRecord) => {
    const normalizedErr = normalizeStoreError(err);
    if (normalizedErr && !isMissingKeyError(normalizedErr))
      return callback(normalizedErr);
    if (!titleRecord || !titleRecord.pageId) {
      return callback(null, { pageId: null, title: titleOrPageId, series: [] });
    }
    byPageId(String(titleRecord.pageId));
  });
}

function getGlobalEditFrequency(gid, year, callback) {
  getValue(gid, `editfreq:global:${year}`, callback);
}

function getEmbeddingEntry(gid, year, word, callback) {
  getValue(gid, `embedding:${year}:${normalizeWord(word)}`, callback);
}

function getAlignmentEntry(gid, baseYear, targetYear, callback) {
  getValue(gid, `align:${baseYear}:${targetYear}`, callback);
}

function getDriftEntry(gid, baseYear, targetYear, word, callback) {
  getValue(
    gid,
    `drift:${baseYear}:${targetYear}:${normalizeWord(word)}`,
    callback,
  );
}

function cosineSimilarity(a, b) {
  if (
    !Array.isArray(a) ||
    !Array.isArray(b) ||
    a.length !== b.length ||
    a.length === 0
  ) {
    return null;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const av = Number(a[i]) || 0;
    const bv = Number(b[i]) || 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return null;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB)); // yay the formula
}

function getNearestNeighbors(gid, year, word, k, callback) {
  const limit = Number.isInteger(k) && k > 0 ? k : 10;
  const normalizedWord = normalizeWord(word);
  const cachedKey = `nn:${year}:${normalizedWord}:${limit}`;

  getValue(gid, cachedKey, (cachedErr, cached) => {
    if (cachedErr) return callback(cachedErr);
    if (Array.isArray(cached)) return callback(null, cached);

    getEmbeddingEntry(gid, year, normalizedWord, (baseErr, baseEmbedding) => {
      if (baseErr) return callback(baseErr);
      if (!baseEmbedding || !Array.isArray(baseEmbedding.vector)) {
        return callback(null, []);
      }

      getAllKeys(gid, (keysErr, keys) => {
        if (keysErr) return callback(keysErr);
        const prefix = `embedding:${year}:`;
        const candidateKeys = keys.filter(
          (x) => typeof x === "string" && x.startsWith(prefix),
        );
        if (candidateKeys.length === 0) return callback(null, []);

        const neighbors = [];
        let pending = candidateKeys.length;
        let failed = false;

        candidateKeys.forEach((embeddingKey) => {
          if (failed) return;
          getValue(gid, embeddingKey, (entryErr, entry) => {
            if (failed) return;
            if (entryErr) {
              failed = true;
              return callback(entryErr);
            }
            const candidateWord = embeddingKey.slice(prefix.length);
            if (
              candidateWord !== normalizedWord &&
              entry &&
              Array.isArray(entry.vector)
            ) {
              const score = cosineSimilarity(
                baseEmbedding.vector,
                entry.vector,
              );
              if (score != null) neighbors.push({ word: candidateWord, score });
            }

            pending -= 1;
            if (pending === 0) {
              neighbors.sort(
                (a, b) => b.score - a.score || a.word.localeCompare(b.word),
              );
              callback(null, neighbors.slice(0, limit));
            }
          });
        });
      });
    });
  });
}

module.exports = {
  getDiffEntry,
  normalizeWord,
  makeTermKey,
  isActiveAtT,
  getTemporalPostings,
  putTemporalPostings,
  getBirthEntry,
  getDeathEntry,
  getDefinitionEntry,
  getPageEditFrequency,
  getGlobalEditFrequency,
  getEmbeddingEntry,
  getAlignmentEntry,
  getDriftEntry,
  getNearestNeighbors,
};
