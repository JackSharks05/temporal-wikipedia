#!/usr/bin/env node

const readline = require('readline');
const {connectToCluster, shutdown, getArg} = require('../lib/clusterConnect');
const {getDiffEntry} = require('./queryIndex');

const gid = getArg('--gid', 'wiki');

let _dist;

function finish(code) {
  shutdown(_dist).then(() => process.exit(code));
}

function printHelp() {
  console.log(`
  Commands:
    <year> <word>                 Diff stats for a word in a year
    <startYear>-<endYear> <word>  Stats for a word across a year range
    help                          Show this message
    exit / quit                   Exit
  `);
}

function printTopList(label, sign, items) {
  if (!Array.isArray(items) || items.length === 0) return;
  console.log(`    ${label}:`);
  const nameWidth = items.reduce((w, it) => Math.max(w, (it.article || '').length), 0);
  for (const it of items) {
    const name = (it.article || '').padEnd(nameWidth);
    const primary = sign === '+' ? `+${it.added}` : `-${it.removed}`;
    const secondary = sign === '+' ? `(-${it.removed})` : `(+${it.added})`;
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
  printTopList('topAdded', '+', value.topAdded);
  printTopList('topRemoved', '-', value.topRemoved);
  console.log();
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
      if (found === 0) console.log(`  No data for "${word}" in ${start}\u2013${end}.`);
      console.log();
      return done();
    }
    getDiffEntry(gid, String(curYear), word, (err, value) => {
      if (!err && value) {
        found++;
        console.log(`  ${curYear}  +${value.totalAdded} -${value.totalRemoved}  (${value.articleCount} articles)`);
      }
      curYear++;
      next();
    });
  })();
}

function dispatch(input, done) {
  if (input === 'help') {
    printHelp();
    return done();
  }

  const range = input.match(/^(\d{4})\s*-\s*(\d{4})\s+(\S+)$/);
  if (range) {
    return handleRange(+range[1], +range[2], range[3].toLowerCase(), done);
  }

  const single = input.match(/^(\d{4})\s+(\S+)$/);
  if (single) {
    return handleSingleYear(single[1], single[2].toLowerCase(), done);
  }

  console.log('  Usage: <year> <word>  or  <startYear>-<endYear> <word>');
  done();
}

function startRepl() {
  printHelp();
  const rl = readline.createInterface({
    input: process.stdin, output: process.stdout, prompt: 'query> ',
  });
  rl.prompt();

  rl.on('line', (line) => {
    const input = line.trim();
    if (!input) return rl.prompt();
    if (input === 'exit' || input === 'quit') return rl.close();
    dispatch(input, () => rl.prompt());
  });

  rl.on('close', () => {
    console.log('Bye.');
    finish(0);
  });
}

(async () => {
  try {
    _dist = await connectToCluster({
      nodesFile: getArg('--nodes-file', null),
      gid,
      port: parseInt(getArg('--port', '8000'), 10),
      ip: getArg('--ip', null),
    });
  } catch (err) {
    console.error('Failed to connect:', err.message);
    process.exit(1);
  }
  console.log(`Connected, group: ${gid}`);
  startRepl();
})();
