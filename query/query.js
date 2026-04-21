#!/usr/bin/env node

const readline = require("readline");
const { connectToCluster, shutdown, getArg } = require("../lib/clusterConnect");
const {
  getDiffEntry,
  getBirthEntry,
  getDeathEntry,
  getDefinitionEntry,
  getPageEditFrequency,
  getGlobalEditFrequency,
  getEmbeddingEntry,
  getAlignmentEntry,
  getDriftEntry,
  getNearestNeighbors,
} = require("./queryIndex");
const { search } = require("./search");

const gid = getArg("--gid", "wiki");

let _dist;

function finish(code) {
  shutdown(_dist).then(() => process.exit(code));
}

function printHelp() {
  console.log(`
  Commands:
    <year> <word>                 Diff stats for a word in a year
    <startYear>-<endYear> <word>  Stats for a word across a year range
    birth <year>                  Top words "born" (added) that year
    death <year>                  Top words that faded (removed) that year
    def <year> <title>            First-sentence definition of a title at year
    search <year> <word...>       TF-IDF search across articles in that year
    edits <title|pageId>          Yearly edit frequency (& equilibrium estimate)
    edits-global <year>           Global edit frequency summary for year
    align <baseYear> <targetYear> Alignment metadata between two years
    drift <baseYear> <targetYear> <word>
                                  Semantic drift for a word between years
    nn <year> <word> [k]          Nearest neighbors for a word in a year
    embed <year> <word>           Inspect a word embedding entry
    help                          Show this message
    exit / quit                   Exit
  `);
}

function printTopList(label, sign, items) {
  if (!Array.isArray(items) || items.length === 0) return;
  console.log(`    ${label}:`);
  const nameWidth = items.reduce(
    (w, it) => Math.max(w, (it.article || "").length),
    0,
  );
  for (const it of items) {
    const name = (it.article || "").padEnd(nameWidth);
    const primary = sign === "+" ? `+${it.added}` : `-${it.removed}`;
    const secondary = sign === "+" ? `(-${it.removed})` : `(+${it.added})`;
    console.log(`      ${name}  ${primary} ${secondary}`);
  }
}

function printEntry(year, word, value) {
  console.log(`\n  diff:${year}:${word}`);
  console.log(`    totalAdded:      ${value.totalAdded}`);
  console.log(`    totalRemoved:    ${value.totalRemoved}`);
  console.log(`    articleCount:    ${value.articleCount}`);
  console.log(`    articlesAdded:   ${value.articlesAdded}`);
  console.log(`    articlesRemoved: ${value.articlesRemoved}`);
  printTopList("topAdded", "+", value.topAdded);
  printTopList("topRemoved", "-", value.topRemoved);
  console.log();
}

function printWordRanking(label, year, items, field, articleField) {
  console.log(`\n  ${label}:${year}`);
  if (!Array.isArray(items) || items.length === 0) {
    console.log("    (empty)\n");
    return;
  }
  const wordWidth = items.reduce(
    (w, it) => Math.max(w, (it.word || "").length),
    0,
  );
  for (const it of items) {
    const word = (it.word || "").padEnd(wordWidth);
    console.log(`      ${word}  ${it[field]}  (${it[articleField]} articles)`);
  }
  console.log();
}

function handleSingleYearDiff(year, word, done) {
  getDiffEntry(gid, year, word, (err, value) => {
    if (err || !value) {
      console.log(`Not found: diff:${year}:${word}`);
    } else {
      printEntry(year, word, value);
    }
    done();
  });
}

function handleBirth(year, done) {
  getBirthEntry(gid, year, (err, value) => {
    if (err || !value) {
      console.log(`Not found: birth:${year}`);
    } else {
      printWordRanking("birth", year, value, "totalAdded", "articlesAdded");
    }
    done();
  });
}

function handleDeath(year, done) {
  getDeathEntry(gid, year, (err, value) => {
    if (err || !value) {
      console.log(`Not found: death:${year}`);
    } else {
      printWordRanking("death", year, value, "totalRemoved", "articlesRemoved");
    }
    done();
  });
}

function handleDefinition(year, title, done) {
  getDefinitionEntry(gid, year, title, (err, value) => {
    if (err || !value) {
      console.log(`  Not found: definition:${year}:${title}`);
    } else {
      console.log(`\n  definition:${year}:${title}`);
      console.log(`    ${value}\n`);
    }
    done();
  });
}

function handleSearch(year, terms, done) {
  search(terms, year, gid, (err, results) => {
    if (err) {
      console.log(`  Search error: ${err.message}`);
    } else if (!results || results.length === 0) {
      console.log(`  No matches for [${terms.join(", ")}] in ${year}`);
    } else {
      console.log(`\n  search ${year} [${terms.join(" ")}]:`);
      const nameWidth = results.reduce(
        (w, r) => Math.max(w, r.title.length),
        0,
      );
      for (const r of results) {
        console.log(`    ${r.title.padEnd(nameWidth)}  tfidf=${r.tfidf.toFixed(4)}`);
      }
      console.log();
    }
    done();
  });
}

function estimateEquilibriumYear(series) {
  if (!Array.isArray(series) || series.length < 5) return null;

  const editsOnly = series.map((x) => Number(x.edits) || 0);
  const avg = editsOnly.reduce((s, v) => s + v, 0) / editsOnly.length;
  const threshold = Math.max(1, avg * 0.1);
  const requiredStableTransitions = 3; // we can tweak this but this makes sense for now

  for (let i = 1; i < series.length; i++) {
    let stable = 0;
    for (let j = i; j < series.length; j++) {
      const delta = Math.abs(
        (series[j].edits || 0) - (series[j - 1].edits || 0),
      );
      if (delta <= threshold) {
        stable += 1;
        if (stable >= requiredStableTransitions) {
          return series[j].year;
        }
      } else {
        break; // oops not stable anymore :(
      }
    }
  }

  return null;
}

function handleEdits(target, done) {
  getPageEditFrequency(gid, target, (err, payload) => {
    if (err) {
      console.log(`Edit-frequency error: ${err.message}`);
      return done();
    }

    const series =
      payload && Array.isArray(payload.series) ? payload.series : [];
    if (series.length === 0) {
      console.log(`  No edit frequency index entries found for "${target}".`);
      console.log(
        "  Run the edit cadence indexer first to enable this command.",
      );
      return done();
    }

    let max = series[0];
    let min = series[0];
    let totalEdits = 0;
    for (const row of series) {
      totalEdits += row.edits;
      if (row.edits > max.edits) max = row;
      if (row.edits < min.edits) min = row;
    }

    const equilibriumYear = estimateEquilibriumYear(series);
    const pageLabel =
      payload && payload.pageId
        ? `pageId=${payload.pageId}`
        : `title=${target}`;

    console.log(`\n  edits ${pageLabel}`);
    console.log(`    years indexed: ${series.length}`);
    console.log(`    total edits:   ${totalEdits}`);
    console.log(`    peak year:     ${max.year} (${max.edits})`);
    console.log(`    low year:      ${min.year} (${min.edits})`);
    if (equilibriumYear != null) {
      console.log(`    equilibrium:   ~${equilibriumYear}`);
    } else {
      console.log("    equilibrium:   not detected with current threshold");
    }

    const preview = series.slice(Math.max(0, series.length - 10));
    console.log("    recent series:");
    for (const row of preview) {
      console.log(`      ${row.year}: ${row.edits}`);
    }
    console.log();
    done();
  });
}

function handleGlobalEdits(year, done) {
  getGlobalEditFrequency(gid, year, (err, value) => {
    if (err || !value) {
      console.log(`  Not found: editfreq:global:${year}`);
      console.log(
        "  Run the edit cadence indexer first to enable this command.",
      );
      return done();
    }

    console.log(`\n  editfreq:global:${year}`);
    console.log(`    totalEdits:       ${value.totalEdits}`);
    console.log(`    distinctPages:    ${value.distinctPages}`);
    console.log(
      `    meanEditsPerPage: ${Number(value.meanEditsPerPage || 0).toFixed(3)}\n`,
    );
    done();
  });
}

function handleAlign(baseYear, targetYear, done) {
  getAlignmentEntry(gid, baseYear, targetYear, (err, value) => {
    if (err || !value) {
      console.log(`  Not found: align:${baseYear}:${targetYear}`);
      console.log(
        "  Alignment index not built yet. Build embeddings/alignment indexers first.",
      );
      return done();
    }

    console.log(`\n  align:${baseYear}:${targetYear}`);
    if (value.sharedVocabSize != null) {
      console.log(`    sharedVocabSize: ${value.sharedVocabSize}`);
    }
    if (value.disparity != null) {
      console.log(`    disparity:       ${value.disparity}`);
    }
    if (Array.isArray(value.matrixR)) {
      const rows = value.matrixR.length;
      const cols =
        rows > 0 && Array.isArray(value.matrixR[0])
          ? value.matrixR[0].length
          : 0;
      console.log(`    matrixR shape:   ${rows} x ${cols}`);
    }
    console.log();
    done();
  });
}

function cosineShift(a, b) {
  if (
    !Array.isArray(a) ||
    !Array.isArray(b) ||
    a.length !== b.length ||
    a.length === 0
  ) {
    return null;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const av = Number(a[i]) || 0;
    const bv = Number(b[i]) || 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return null;
  return 1 - dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function handleDrift(baseYear, targetYear, word, done) {
  getDriftEntry(gid, baseYear, targetYear, word, (err, value) => {
    if (!err && value) {
      console.log(`\n  drift:${baseYear}:${targetYear}:${word}`);
      if (value.cosineShift != null)
        console.log(`    cosineShift:    ${value.cosineShift}`);
      if (value.euclideanShift != null)
        console.log(`    euclideanShift: ${value.euclideanShift}`);
      if (value.rankShift != null)
        console.log(`    rankShift:      ${value.rankShift}`);
      console.log();
      return done();
    }

    // this is a fallback bc i didn't implement drift yet but will be fixed
    getEmbeddingEntry(gid, baseYear, word, (baseErr, baseEmbedding) => {
      if (baseErr || !baseEmbedding || !Array.isArray(baseEmbedding.vector)) {
        console.log(
          `  Drift unavailable for ${word} between ${baseYear} and ${targetYear}.`,
        );
        console.log("  Build embedding and drift indexes first.");
        return done();
      }
      getEmbeddingEntry(gid, targetYear, word, (targetErr, targetEmbedding) => {
        if (
          targetErr ||
          !targetEmbedding ||
          !Array.isArray(targetEmbedding.vector)
        ) {
          console.log(
            `  Drift unavailable for ${word} between ${baseYear} and ${targetYear}.`,
          );
          console.log("  Build embedding and drift indexes first.");
          return done();
        }

        const unaligned = cosineShift(
          baseEmbedding.vector,
          targetEmbedding.vector,
        );
        console.log(`\n  drift:${baseYear}:${targetYear}:${word}`);
        console.log(
          "    indexed drift key not found; showing unaligned fallback.",
        );
        if (unaligned != null) {
          console.log(`    cosineShift(unaligned): ${unaligned}`);
        } else {
          console.log(
            "    cosineShift(unaligned): unavailable (dimension mismatch)",
          );
        }
        console.log();
        done();
      });
    });
  });
}

function handleNeighbors(year, word, k, done) {
  const topK = Number.isInteger(k) && k > 0 ? k : 10;
  getNearestNeighbors(gid, year, word, topK, (err, neighbors) => {
    if (err) {
      console.log(`  Nearest-neighbors error: ${err.message}`);
      return done();
    }
    if (!neighbors || neighbors.length === 0) {
      console.log(`  No nearest neighbors found for ${word} in ${year}.`);
      console.log("  Build embedding index first, then rerun this command.");
      return done();
    }

    console.log(`\n  nn ${year} ${word} (top ${topK})`);
    for (const row of neighbors) {
      console.log(`    ${row.word}  score=${Number(row.score).toFixed(6)}`);
    }
    console.log();
    done();
  });
}

function handleEmbeddingInspect(year, word, done) {
  getEmbeddingEntry(gid, year, word, (err, value) => {
    if (err || !value) {
      console.log(`  Not found: embedding:${year}:${word}`);
      console.log("  Embedding index is not built yet for this key.");
      return done();
    }

    const vector = Array.isArray(value.vector) ? value.vector : [];
    console.log(`\n  embedding:${year}:${word}`);
    console.log(`    dimension: ${vector.length}`);
    if (value.norm != null) console.log(`    norm:      ${value.norm}`);
    if (Array.isArray(value.topFeatures) && value.topFeatures.length > 0) {
      console.log("    topFeatures:");
      value.topFeatures.slice(0, 10).forEach((x) => {
        if (x && x.feature != null && x.weight != null) {
          console.log(`      ${x.feature}: ${x.weight}`);
        }
      });
    }
    console.log();
    done();
  });
}

function handleRangeDiff(start, end, word, done) {
  let curYear = start;
  let found = 0;
  console.log();

  function next() {
    if (curYear > end) {
      if (found === 0)
        console.log(`No data for "${word}" in ${start}\u2013${end}.`);
      console.log();
      return done();
    }
    getDiffEntry(gid, String(curYear), word, (err, value) => {
      if (!err && value) {
        found++;
        console.log(
          `  ${curYear}  +${value.totalAdded} -${value.totalRemoved}  (${value.articleCount} articles)`,
        );
      }
      curYear++;
      next();
    });
  }
  next();
}

function dispatch(input, done) {
  if (input === "help") {
    printHelp();
    return done();
  }

  const parts = input.split(/\s+/);
  const cmd = parts[0];

  if (cmd === 'birth' && parts[1]) {
    return handleBirth(parts[1], done);
  }

  if (cmd === 'death' && parts[1]) {
    return handleDeath(parts[1], done);
  }

  if (cmd === 'def' && parts.length >= 3) {
    const year = parts[1];
    const title = parts.slice(2).join(' ');
    return handleDefinition(year, title, done);
  }

  if (cmd === 'search' && parts.length >= 3) {
    const year = parts[1];
    const terms = parts.slice(2).map((t) => t.toLowerCase());
    return handleSearch(year, terms, done);
  }

  const editsGlobal = input.match(/^edits-global\s+(\d{4})$/i);
  if (editsGlobal) return handleGlobalEdits(editsGlobal[1], done);

  const edits = input.match(/^edits\s+(.+)$/i);
  if (edits) return handleEdits(edits[1].trim(), done);

  const align = input.match(/^align\s+(\d{4})\s+(\d{4})$/i);
  if (align) return handleAlign(align[1], align[2], done);

  const drift = input.match(/^drift\s+(\d{4})\s+(\d{4})\s+(\S+)$/i);
  if (drift)
    return handleDrift(drift[1], drift[2], drift[3].toLowerCase(), done);

  const neighbors = input.match(/^nn\s+(\d{4})\s+(\S+)(?:\s+(\d+))?$/i);
  if (neighbors) {
    const k = neighbors[3] ? parseInt(neighbors[3], 10) : 10;
    return handleNeighbors(neighbors[1], neighbors[2].toLowerCase(), k, done);
  }

  const embed = input.match(/^embed\s+(\d{4})\s+(\S+)$/i);
  if (embed)
    return handleEmbeddingInspect(embed[1], embed[2].toLowerCase(), done);

  const range = input.match(/^(\d{4})\s*-\s*(\d{4})\s+(\S+)$/);
  if (range) {
    return handleRangeDiff(+range[1], +range[2], range[3].toLowerCase(), done);
  }

  if (cmd.includes('-')) {
    const [start, end] = cmd.split('-');
    return handleRangeDiff(+start, +end, parts[1].toLowerCase(), done);
  }

  return handleSingleYearDiff(cmd, parts[1].toLowerCase(), done);
}

function startRepl() {
  printHelp();
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "query> ",
  });
  rl.prompt();

  rl.on("line", (line) => {
    const input = line.trim();
    if (!input) return rl.prompt();
    if (input === "exit" || input === "quit") return rl.close();
    dispatch(input, () => rl.prompt());
  });

  rl.on("close", () => {
    console.log("Bye.");
    finish(0);
  });
}

async function main() {
  try {
    _dist = await connectToCluster({
      nodesFile: getArg("--nodes-file", null),
      gid,
      port: parseInt(getArg("--port", "8000"), 10),
      ip: getArg("--ip", null),
    });
  } catch (err) {
    console.error("Failed to connect:", err.message);
    process.exit(1);
  }
  console.log(`Connected, group: ${gid}`);
  startRepl();
};

if (require.main == module) {
    main();
}
