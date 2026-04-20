function reduceEditCadence(key, values) {
  const vals = Array.isArray(values) ? values : [values];
  const parts = key.split(":");

  if (parts.length < 3 || parts[0] !== "editcadence") {
    throw new Error(`oops, unexpected key format: ${key}`);
  }

  const scope = parts[1];

  if (scope === "page") {
    const pageId = parts[2];
    const year = parts[3];
    const edits = vals.reduce((sum, v) => sum + ((v && v.count) || 0), 0);

    return {
      [`editfreq:page:${pageId}:${year}`]: {
        pageId,
        year: Number(year),
        edits,
      },
    };
  }

  if (scope === "global") {
    const year = parts[2];
    let totalEdits = 0;
    const pageIds = new Set();

    for (const v of vals) {
      if (!v) continue;
      totalEdits += v.count || 0;
      if (v.pageId) pageIds.add(String(v.pageId));
    }

    const distinctPages = pageIds.size;
    return {
      [`editfreq:global:${year}`]: {
        year: Number(year),
        totalEdits,
        distinctPages,
        meanEditsPerPage: distinctPages > 0 ? totalEdits / distinctPages : 0,
      },
    };
  }

  throw new Error(`oops - unexpected edit cadence scope: ${scope}`);
}

module.exports = { reduceEditCadence };
