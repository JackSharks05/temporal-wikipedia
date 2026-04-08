/**
 * Query a single diff:year:word entry from the store.
 */

function normalizeStoreError(error) {
  if (!error) return null;
  if (error instanceof Error) return error;
  if (typeof error === 'object' && Object.keys(error).length === 0) return null;
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
  store.get({key: `diff:${year}:${word}`, gid}, (err, value) => {
    callback(normalizeStoreError(err), value);
  });
}

module.exports = {getDiffEntry};
