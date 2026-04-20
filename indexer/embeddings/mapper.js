function normalizeWord(word) {
  return String(word || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "");
}

// mapper over cooc:<year>:<word> rows
// emits one row keyed by "<year>:<word>" with neighbor counts for embedding reduction
function mapCooccurrenceForEmbedding(key, data, ctx) {
  if (!data || !Array.isArray(data.neighbors)) return [];

  const parts = String(key).split(":");
  if (parts.length < 3 || parts[0] !== "cooc") return [];

  const year = Number(parts[1]);
  const word = normalizeWord(parts.slice(2).join(":"));
  if (!word || Number.isNaN(year)) return [];

  const maxNeighborsPerWord = Math.max(1, (ctx && ctx.maxNeighborsPerWord) || 80);
  const minCount = Math.max(1, (ctx && ctx.minCount) || 1);

  const neighbors = data.neighbors
    .map((n) => ({
      neighbor: normalizeWord(n && n.neighbor),
      count: Number(n && n.count) || 0,
    }))
    .filter((n) => n.neighbor && n.count >= minCount)
    .sort((a, b) => b.count - a.count || a.neighbor.localeCompare(b.neighbor))
    .slice(0, maxNeighborsPerWord);

  if (neighbors.length === 0) return [];

  return {
    [`${year}:${word}`]: {
      year,
      word,
      neighbors,
    },
  };
}

module.exports = { mapCooccurrenceForEmbedding, normalizeWord };
