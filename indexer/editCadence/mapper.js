function yearFromTimestamp(timestamp) {
  if (!timestamp) return null;
  const epoch = Date.parse(String(timestamp));
  if (Number.isNaN(epoch)) return null;
  return new Date(epoch).getUTCFullYear();
}

// For each article segment, emit edit counts by page-year and global-year.
function mapSegmentEdits(key, data) {
  if (!data || !data.pageId) return [];

  const pageId = String(data.pageId);
  const countsByYear = Object.create(null);

  function countTimestamp(ts) {
    const year = yearFromTimestamp(ts);
    if (year == null) return;
    const y = String(year);
    countsByYear[y] = (countsByYear[y] || 0) + 1;
  }

  if (data.base && data.base.timestamp) {
    countTimestamp(data.base.timestamp);
  }

  for (const delta of data.deltas || []) {
    countTimestamp(delta.timestamp);
  }

  const entries = [];
  for (const [year, count] of Object.entries(countsByYear)) {
    entries.push({
      [`editcadence:page:${pageId}:${year}`]: {
        pageId,
        year: Number(year),
        count,
      },
    });
    entries.push({
      [`editcadence:global:${year}`]: {
        pageId,
        year: Number(year),
        count,
      },
    });
  }

  return entries;
}

module.exports = { mapSegmentEdits };
