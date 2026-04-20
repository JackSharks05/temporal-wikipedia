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
