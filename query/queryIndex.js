const {normalizeError: normalizeStoreError} = require('../lib/normalizeError');

function getDiffEntry(gid, year, word, callback) {
  const store = globalThis.distribution[gid].store;
  store.get({key: `diff:${year}:${word}`, gid}, (err, value) => {
    callback(normalizeStoreError(err), value);
  });
}

function getBirthEntry(gid, year, callback) {
  const store = globalThis.distribution[gid].store;
  store.get({key: `birth:${year}`, gid}, (err, value) => {
    callback(normalizeStoreError(err), value);
  });
}

function getDeathEntry(gid, year, callback) {
  const store = globalThis.distribution[gid].store;
  store.get({key: `death:${year}`, gid}, (err, value) => {
    callback(normalizeStoreError(err), value);
  });
}

function getDefinitionEntry(gid, year, title, callback) {
  const store = globalThis.distribution[gid].store;
  store.get({key: `definition:${year}:${title}`, gid}, (err, value) => {
    callback(normalizeStoreError(err), value);
  });
}

module.exports = {
  getDiffEntry,
  getBirthEntry,
  getDeathEntry,
  getDefinitionEntry,
};
