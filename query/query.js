#!/usr/bin/env node

const readline = require("readline");
const distribution = require("../distribution");
const {
  getDiffEntry,
  makeTermKey,
  isActiveAtT,
  getTemporalPostings,
} = require("./queryIndex");

function getArg(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx + 1 >= process.argv.length) return fallback;
  return process.argv[idx + 1];
}

const gid = getArg("--gid", "all");
const port = parseInt(getArg("--port", "9000"), 10);
const ip = getArg("--ip", "127.0.0.1");
const dist = distribution({ ip, port });

function finish(code) {
  dist.local.status.stop(() => process.exit(code));
}

function printHelp() {
  console.log(`
  Commands:
    <year> <word>                 Diff stats for a word in a year
    <startYear>-<endYear> <word>  Stats for a word across a year range
    temporal <word> <timestamp>   Inspect active temporal postings at timestamp
    help                          Show this message
    exit / quit                   Exit
  `);
}

// this is a bit of a testing function
function handleTemporalInspect(word, timestamp, done) {
  getTemporalPostings(gid, word, (e, postings) => {
    if (e) {
      console.log(`oops! error loading ${makeTermKey(word)}: ${e}`);
      return done();
    }
    const active = postings.filter((record) => isActiveAtT(record, timestamp));
    console.log(`\n key: ${makeTermKey(word)}`);
    console.log(`timestamp: ${timestamp}`);
    console.log(`# postings: ${postings.length}`);
    console.log(`# active: ${active.length}`);
    if (active.length > 0) {
      const ample = active
        .slice(0, 10)
        .map((record) => record.docId)
        .join(", ");
      console.log(`sample docIds: ${sample}`);
    }
    done();
  });
}

function printEntry(year, word, value) {
  console.log(`\n  diff:${year}:${word}`);
  console.log(`    totalAdded:       ${value.totalAdded}`);
  console.log(`    totalRemoved:     ${value.totalRemoved}`);
  console.log(`    articleCount:     ${value.articleCount}`);
  console.log(`    articlesAdded:   ${value.articlesAdded}`);
  console.log(`    articlesRemoved: ${value.articlesRemoved}\n`);
}

function handleSingleYear(year, word, done) {
  getDiffEntry(gid, year, word, (err, value) => {
    if (err) {
      console.log(`  Not found: diff:${year}:${word}`);
    } else {
      printEntry(year, word, value);
    }
    done();
  });
}

function handleRange(start, end, word, done) {
  let curYear = start;
  let found = 0;
  console.log();

  (function next() {
    if (curYear > end) {
      if (found === 0)
        console.log(`  No data for "${word}" in ${start}–${end}.`);
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
  })();
}

function dispatch(input, done) {
  if (input === "help") {
    printHelp();
    return done();
  }

  const temporal = input.match(/^temporal\s+(\S+)\s+(.+)$/i);
  if (temporal) {
    return handleTemporalInspect(temporal[1].toLowerCase(), temporal[2], done);
  }

  const range = input.match(/^(\d{4})\s*-\s*(\d{4})\s+(\S+)$/);
  if (range) {
    return handleRange(+range[1], +range[2], range[3].toLowerCase(), done);
  }

  const single = input.match(/^(\d{4})\s+(\S+)$/);
  if (single) {
    return handleSingleYear(single[1], single[2].toLowerCase(), done);
  }

  console.log(
    "  Usage: <year> <word>  or  <startYear>-<endYear> <word>  or  temporal <word> <timestamp>",
  );
  done();
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

dist.node.start((server) => {
  if (server instanceof Error) {
    console.error(server);
    return finish(1);
  }
  console.log(`Connected to ${ip}:${port}, group: ${gid}`);
  startRepl();
});
