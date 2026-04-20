function reduceYearCoocurrence(year, word, counts) {
  const totalCoocurrence = counts.reduce((acc, count) => acc + count, 0);
  return { year, word, totalCoocurrence };
}

function reduceYearWord(key, values) {
  const [prefix, year, word] = key.split(":");
  if (prefix !== "diff") {
    throw new Error(`Unexpected key prefix: ${prefix}`);
  }
  const totalCoocurrence = values.reduce(
    (sum, v) => sum + v.totalCoocurrence,
    0,
  );
  return {
    key: `diff:${year}:${word}`,
    value: totalCoocurrence,
  };
}

module.exports = { reduceYearWord, reduceYearCoocurrence };
