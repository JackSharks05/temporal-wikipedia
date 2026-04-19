#!/usr/bin/env node

const {connectToCluster, shutdown, getArg} = require('../lib/clusterConnect');
const {
  getDiffEntry,
  getBirthEntry,
  getDeathEntry,
  getDefinitionEntry,
} = require('../query/queryIndex');
const {search} = require('../query/search');

const gid = getArg('--gid', 'wiki');
const ITERATIONS = parseInt(getArg('--n', '100'), 10);
const CONCURRENCY = parseInt(getArg('--concurrency', '10'), 10);

const YEARS = [2003, 2005, 2010, 2015, 2020, 2024];
const WORDS = ['computer', 'internet', 'alan', 'turing', 'mathematician',
  'president', 'film', 'war', 'music', 'science'];
const TITLES = ['Alan Turing', 'Internet', 'Computer', 'Barack Obama',
  'World War II', 'Wikipedia'];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function runBenchmark(name, makeCall, callback) {
  const latencies = [];
  const start = Date.now();
  let idx = 0;
  let inFlight = 0;

  function pump() {
    while (inFlight < CONCURRENCY && idx < ITERATIONS) {
      inFlight++;
      idx++;
      const t0 = Date.now();
      makeCall((err) => {
        latencies.push(Date.now() - t0);
        inFlight--;
        if (idx >= ITERATIONS && inFlight === 0) return done();
        pump();
      });
    }
  }

  function done() {
    const totalMs = Date.now() - start;
    latencies.sort((a, b) => a - b);
    const pct = (q) => latencies[Math.min(Math.floor(latencies.length * q), latencies.length - 1)];
    const avg = latencies.reduce((s, x) => s + x, 0) / latencies.length;
    callback({
      name,
      totalMs,
      qps: ((ITERATIONS / totalMs) * 1000).toFixed(1),
      avg: avg.toFixed(1),
      p50: pct(0.5),
      p90: pct(0.9),
      p99: pct(0.99),
      min: latencies[0],
      max: latencies[latencies.length - 1],
    });
  }

  pump();
}

const tests = [
//   {
//     name: 'diff',
//     makeCall: (cb) => getDiffEntry(gid, pick(YEARS), pick(WORDS), cb),
//   },
//   {
//     name: 'birth',
//     makeCall: (cb) => getBirthEntry(gid, pick(YEARS), cb),
//   },
//   {
//     name: 'death',
//     makeCall: (cb) => getDeathEntry(gid, pick(YEARS), cb),
//   },
//   {
//     name: 'definition',
//     makeCall: (cb) => getDefinitionEntry(gid, pick(YEARS), pick(TITLES), cb),
//   },
  {
    name: 'search (1 word)',
    makeCall: (cb) => search([pick(WORDS)], pick(YEARS), gid, cb),
  },
  {
    name: 'search (3 words)',
    makeCall: (cb) => search([pick(WORDS), pick(WORDS), pick(WORDS)], pick(YEARS), gid, cb),
  },
];

function runAll(dist) {
  const results = [];
  let i = 0;

  function next() {
    if (i >= tests.length) return printSummary(results, dist);
    const t = tests[i++];
    process.stdout.write(`[bench] running ${t.name} (n=${ITERATIONS}, concurrency=${CONCURRENCY})... `);
    runBenchmark(t.name, t.makeCall, (r) => {
      console.log('done');
      results.push(r);
      next();
    });
  }

  next();
}

function printSummary(results, dist) {
  console.log(`\nBENCHMARK RESULTS (iterations=${ITERATIONS}, concurrency=${CONCURRENCY})\n`);

  const header = ['query', 'total ms', 'qps', 'avg', 'p50', 'p90', 'p99', 'min', 'max'];
  const widths = header.map((h) => h.length);
  const rows = results.map((r) => [
    r.name, String(r.totalMs), String(r.qps),
    String(r.avg), String(r.p50), String(r.p90),
    String(r.p99), String(r.min), String(r.max),
  ]);
  for (const row of rows) {
    for (let j = 0; j < row.length; j++) {
      if (row[j].length > widths[j]) widths[j] = row[j].length;
    }
  }

  const pad = (s, w, alignRight = true) =>
    alignRight ? String(s).padStart(w) : String(s).padEnd(w);

  const fmt = (row) =>
    row.map((cell, j) => pad(cell, widths[j], j > 0)).join('  ');

  console.log(fmt(header));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of rows) console.log(fmt(row));

  shutdown(dist).then(() => process.exit(0));
}

(async () => {
  let dist;
  try {
    dist = await connectToCluster({
      nodesFile: getArg('--nodes-file', null),
      gid,
      port: parseInt(getArg('--port', '8099'), 10),
      ip: getArg('--ip', null),
    });
  } catch (err) {
    console.error('Failed to connect:', err.message);
    process.exit(1);
  }
  console.log(`[bench] connected, gid=${gid}\n`);
  runAll(dist);
})();
