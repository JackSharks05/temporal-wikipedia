// for each segment record, emit edit counts by page/year and globalyear
function mapSegmentEdits(key, data) {
  const { year, page, edits } = data;
  const globalYear = String(year);
  const wordCounts = {};
  for (const edit of edits) {
    const words = edit.words || [];
    for (const word of words) {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    }
  }
  const entries = Object.entries(wordCounts).map(([word, count]) => ({
    key: `diff:${globalYear}:${word}`,
    value: { totalAdded: count, totalRemoved: 0, articleCount: 1 },
  }));
  return entries;
}

module.exports = { mapSegmentEdits };
