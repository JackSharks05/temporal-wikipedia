/**
 * Query a single diff:year:word entry from the store.
 */

const {normalizeError: normalizeStoreError} = require('../lib/normalizeError');

/**
 * Fetch a single diff:year:word record.
 * @param {string} gid
 * @param {string} year
 * @param {string} word
 * @param {(err: Error|null, value?: Object) => void} callback
 */
function getDiffEntry(gid, year, word, callback) {
  const store = globalThis.distribution[gid].store;
  store.get({key: `diff:${year}:${word}`, gid}, (err, value) => {
    callback(normalizeStoreError(err), value);
  });
}

module.exports = {getDiffEntry};
