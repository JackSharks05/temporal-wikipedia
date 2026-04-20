function reduceYearCooccurrence(key, values, ctx) {
  const vals = Array.isArray(values) ? values : [values];
  const topN = (ctx && ctx.topN) || 50;

  const parts = key.split(":");
  if (parts.length < 3 || parts[0] !== "cooc") {
    throw new Error(`Unexpected key format: ${key}`);
  }

  const year = parts[1];
  const word = parts.slice(2).join(":");
  const neighborCounts = new Map();

  for (const v of vals) {
    if (!v || !v.neighbor) continue;
    const neighbor = String(v.neighbor);
    const count = Number(v.count) || 0;
    if (count <= 0) continue;
    neighborCounts.set(neighbor, (neighborCounts.get(neighbor) || 0) + count);
  }

  const neighbors = [...neighborCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topN)
    .map(([neighbor, count]) => ({ neighbor, count }));

  return {
    [`cooc:${year}:${word}`]: {
      year: Number(year),
      word,
      neighbors,
    },
  };
}

module.exports = { reduceYearCooccurrence };
