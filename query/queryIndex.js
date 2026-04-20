const {
  normalizeError: normalizeStoreError,
} = require("../lib/normalizeError");

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

function getBirthEntry(gid, year, callback) {
  const store = globalThis.distribution[gid].store;
  store.get({ key: `birth:${year}`, gid }, (err, value) => {
    callback(normalizeStoreError(err), value);
  });
}

function getDeathEntry(gid, year, callback) {
  const store = globalThis.distribution[gid].store;
  store.get({ key: `death:${year}`, gid }, (err, value) => {
    callback(normalizeStoreError(err), value);
  });
}

function getDefinitionEntry(gid, year, title, callback) {
  const store = globalThis.distribution[gid].store;
  store.get({ key: `definition:${year}:${title}`, gid }, (err, value) => {
    callback(normalizeStoreError(err), value);
  });
}

function getPageEditFrequency(gid, pageId, callback) {
  const store = globalThis.distribution[gid].store;
  store.get({ key: `pageEditFrequency:${pageId}`, gid }, (err, value) => {
    callback(normalizeStoreError(err), value);
  });
}

function getGlobalEditFrequency(gid, year, callback) {
  const store = globalThis.distribution[gid].store;
  store.get({ key: `globalEditFrequency:${year}`, gid }, (err, value) => {
    callback(normalizeStoreError(err), value);
  });
}

module.exports = {
  getDiffEntry,
  getBirthEntry,
  getDeathEntry,
  getDefinitionEntry,
  getPageEditFrequency,
  getGlobalEditFrequency,
};
