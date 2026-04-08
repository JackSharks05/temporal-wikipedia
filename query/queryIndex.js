/**
 * Query a single diff:year:word entry from the store.
 */

function normalizeStoreError(error) {
  if (!error) return null;
  if (error instanceof Error) return error;
  if (typeof error === "object" && Object.keys(error).length === 0) return null;
  return new Error(String(error));
}

/**
 * Fetch a single diff:year:word record.
 * @param {string} gid
 * @param {string} year
 * @param {string} word
 * @param {(err: Error|null, value?: Object) => void} callback
 */
function getDiffEntry(gid, year, word, callback) {
  const store = globalThis.distribution[gid].store;
  store.get({ key: `diff:${year}:${word}`, gid }, (err, value) => {
    callback(normalizeStoreError(err), value);
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
    if (typeof t === "number") return record;
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
  const store = globalThis.distribution[gid].store;
  store.get({ key: makeTermKey(word), gid }, (err, value) => {
    const normalizedErr = normalizeStoreError(err);
    if (isMissingKeyError(normalizedErr)) return callback(null, []);
    if (normalizedErr) return callback(normalizedErr);
    if (!Array.isArray(value)) return callback(null, []);
    callback(null, value);
  });
}

// and put function!
function putTemporalPostings(gid, word, postings, callback) {
  const store = globalThis.distribution[gid].store;
  store.put(postings, { key: makeTermKey(word), gid }, (err, value) => {
    callback(normalizeStoreError(err), value);
  });
}

module.exports = {
  getDiffEntry,
  makeTermKey,
  isActiveAtT,
  getTemporalPostings,
  putTemporalPostings,
};
