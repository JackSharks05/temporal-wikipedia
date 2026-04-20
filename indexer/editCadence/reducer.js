function reduceEditCadence(yearWord, editCadences) {
  const totalCadence = editCadences.reduce((acc, cadence) => acc + cadence, 0);
  return { yearWord, totalCadence };
}

function reduceYearWord(key, values) {
  const [prefix, year, word] = key.split(":");
  if (prefix !== "diff") {
    throw new Error(`Unexpected key prefix: ${prefix}`);
  }
  const totalAdded = values.reduce((sum, v) => sum + (v.totalAdded || 0), 0);
  const totalRemoved = values.reduce(
    (sum, v) => sum + (v.totalRemoved || 0),
    0,
  );
  const articleCount = values.reduce(
    (sum, v) => sum + (v.articleCount || 0),
    0,
  );
  return {
    key: `diff:${year}:${word}`,
    value: { totalAdded, totalRemoved, articleCount },
  };
}

module.exports = { reduceYearWord, reduceEditCadence };
