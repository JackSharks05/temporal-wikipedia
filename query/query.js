#!/usr/bin/env node

const readline = require('readline');
const {connectToCluster, shutdown, getArg} = require('../lib/clusterConnect');
const {
  getDiffEntry,
  getBirthEntry,
  getDeathEntry,
  getDefinitionEntry,
} = require('./queryIndex');
const {search} = require('./search');

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
    birth <year>                  Top words "born" (added) that year
    death <year>                  Top words that faded (removed) that year
    def <year> <title>            First-sentence definition of a title at year
    search <year> <word...>       TF-IDF search across articles in that year
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

function printWordRanking(label, year, items, field, articleField) {
  console.log(`\n  ${label}:${year}`);
  if (!Array.isArray(items) || items.length === 0) {
    console.log('    (empty)\n');
    return;
  }
  const wordWidth = items.reduce((w, it) => Math.max(w, (it.word || '').length), 0);
  for (const it of items) {
    const word = (it.word || '').padEnd(wordWidth);
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
      printWordRanking('birth', year, value, 'totalAdded', 'articlesAdded');
    }
    done();
  });
}

function handleDeath(year, done) {
  getDeathEntry(gid, year, (err, value) => {
    if (err || !value) {
      console.log(`Not found: death:${year}`);
    } else {
      printWordRanking('death', year, value, 'totalRemoved', 'articlesRemoved');
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
      console.log(`  No matches for [${terms.join(', ')}] in ${year}`);
    } else {
      console.log(`\n  search ${year} [${terms.join(' ')}]:`);
      const nameWidth = results.reduce((w, r) => Math.max(w, r.title.length), 0);
      for (const r of results) {
        console.log(`    ${r.title.padEnd(nameWidth)}  tfidf=${r.tfidf.toFixed(4)}  matches=${r.matches}/${terms.length}`);
      }
      console.log();
    }
    done();
  });
}

function handleRangeDiff(start, end, word, done) {
  let curYear = start;
  let found = 0;
  console.log();

  function next() {
    if (curYear > end) {
      if (found === 0) console.log(`No data for "${word}" in ${start}\u2013${end}.`);
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
  };
  next();
}



function dispatch(input, done) {
  if (input === 'help') {
    printHelp();
    return done();
  }

  const birth = input.match(/^birth\s+(\d{4})$/i);
  if (birth) return handleBirth(birth[1], done);

  const death = input.match(/^death\s+(\d{4})$/i);
  if (death) return handleDeath(death[1], done);

  const def = input.match(/^def\s+(\d{4})\s+(.+)$/i);
  if (def) return handleDefinition(def[1], def[2].trim(), done);

  const searchMatch = input.match(/^search\s+(\d{4})\s+(.+)$/i);
  if (searchMatch) {
    const terms = searchMatch[2].trim().toLowerCase().split(/\s+/).filter(Boolean);
    return handleSearch(searchMatch[1], terms, done);
  }

  const range = input.match(/^(\d{4})\s*-\s*(\d{4})\s+(\S+)$/);
  if (range) {
    return handleRangeDiff(+range[1], +range[2], range[3].toLowerCase(), done);
  }

  const single = input.match(/^(\d{4})\s+(\S+)$/);
  if (single) {
    return handleSingleYearDiff(single[1], single[2].toLowerCase(), done);
  }

  console.log('Unknown command. Type "help" for options.');
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
