// this uses fowler noll vo hash function for hasing neighbors into vector slots (deterministic projection)
function stableHash(text) {
  let hash = 2166136261; // unsigned 32 bit integer: found from wikipedia FNV hash
  const str = String(text || "");
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash >>> 0;
}

function makeVector(neighborCounts, dimension) {
  // build a dense normalized embedding vector from sparse neighbor counts
  const vector = new Array(dimension).fill(0);

  for (const [neighbor, rawCount] of neighborCounts.entries()) {
    const weight = Math.log1p(rawCount); // weighting
    const slotHash = stableHash(neighbor);
    const signHash = stableHash(`${neighbor}#sign`);
    const slot = slotHash % dimension;
    const sign = (signHash & 1) === 0 ? 1 : -1;
    vector[slot] += sign * weight;
  }

  let norm = 0;
  for (const v of vector) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < vector.length; i++) vector[i] /= norm;
  }

  return { vector, norm };
}

function reduceYearWordEmbedding(key, values, ctx) {
  const vals = Array.isArray(values) ? values : [values];
  const parts = String(key).split(":");
  if (parts.length < 2) {
    throw new Error(`Unexpected embedding reduce key: ${key}`);
  }

  const year = Number(parts[0]);
  const word = parts.slice(1).join(":");

  const dimension = Math.max(8, (ctx && ctx.dimension) || 64);
  const topFeaturesCount = Math.max(1, (ctx && ctx.topFeaturesCount) || 12);

  const neighborCounts = new Map();
  for (const v of vals) {
    if (!v || !Array.isArray(v.neighbors)) continue;
    for (const n of v.neighbors) {
      const neighbor = String((n && n.neighbor) || "").trim();
      const count = Number(n && n.count) || 0;
      if (!neighbor || count <= 0) continue;
      neighborCounts.set(neighbor, (neighborCounts.get(neighbor) || 0) + count);
    }
  }

  const { vector, norm } = makeVector(neighborCounts, dimension);
  const topFeatures = [...neighborCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topFeaturesCount)
    .map(([feature, weight]) => ({ feature, weight }));

  return {
    [`embedding:${year}:${word}`]: {
      year,
      word,
      vector,
      norm,
      featureCount: neighborCounts.size,
      topFeatures,
    },
  };
}

module.exports = { reduceYearWordEmbedding };
