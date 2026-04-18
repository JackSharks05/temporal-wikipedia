/**
 *
 * Store/comm callbacks return errors in several shapes:
 *   - null / undefined (no error)
 *   - a plain Error
 *   - an empty object {} (legacy "no error" sentinel from some services)
 *   - a {sid: Error} or {sid: {sid: Error}} map when one or more nodes failed
 *
 * Returns a single Error (or null). For the per-node failure map, walks
 * values until it finds the first truthy leaf and returns that.
 */
function normalizeError(error) {
  if (!error) return null;
  if (error instanceof Error) return error;
  if (typeof error === 'object') {
    const values = Object.values(error);
    for (const v of values) {
      if (!v) continue;
      const inner = normalizeError(v);
      if (inner) return inner;
    }
    return null;
  }
  return new Error(String(error));
}

module.exports = {normalizeError};
