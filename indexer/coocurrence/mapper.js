// for each article-year text, emit coocurrence counts within a certain window size
function mapYearCoocurrence(key, data) {
  const { year, text } = data;
  const words = text.split(/\s+/);
  const coocurrenceCounts = {};
  const windowSize = 7;
  for (let i = 0; i < words.length; i++) {
    const word = words[i].toLowerCase();
    if (!word) continue;
    const windowStart = Math.max(0, i - windowSize);
    const windowEnd = Math.min(words.length, i + windowSize + 1);
    for (let j = windowStart; j < windowEnd; j++) {
      if (j === i) continue;
      const coWord = words[j].toLowerCase();
      if (!coWord) continue;
      const pairKey = `${year}:${word}:${coWord}`;
      coocurrenceCounts[pairKey] = (coocurrenceCounts[pairKey] || 0) + 1;
    }
  }
  return Object.entries(coocurrenceCounts).map(([pairKey, count]) => ({
    key: `diff:${pairKey}`,
    value: count,
  }));
}
module.exports = { mapYearCoocurrence };
