#!/usr/bin/env node

/*
Merge the current inverted index (assuming the right structure) with the global index file
Usage: input > ./merge.js global-index > output

The inverted indices have the different structures!

Each line of a local index is formatted as:
  - `<word/ngram> | <frequency> | <url>`

Each line of a global index is be formatted as:
  - `<word/ngram> | <url_1> <frequency_1> <url_2> <frequency_2> ... <url_n> <frequency_n>`
  - Where pairs of `url` and `frequency` are in descending order of frequency
  - Everything after `|` is space-separated

-------------------------------------------------------------------------------------
Example:

local index:
  word1 word2 | 8 | url1
  word3 | 1 | url9
EXISTING global index:
  word1 word2 | url4 2
  word3 | url3 2

merge into the NEW global index:
  word1 word2 | url1 8 url4 2
  word3 | url3 2 url9 1

Remember to error gracefully, particularly when reading the global index file.
*/

const fs = require('fs');
const readline = require('readline');
// The `compare` function can be used for sorting.
const compare = (a, b) => {
  if (a.freq > b.freq) {
    return -1;
  } else if (a.freq < b.freq) {
    return 1;
  } else {
    return 0;
  }
};
const rl = readline.createInterface({
  input: process.stdin,
});

// 1. Read the incoming local index data from standard input (stdin) line by line.
let localIndex = '';
rl.on('line', (line) => {
  localIndex += line + '\n';
});

rl.on('close', () => {
  // 2. Read the global index name/location, using process.argv
  // and call printMerged as a callback
  const globalIndex = process.argv[2];
  fs.readFile(globalIndex, 'utf-8', printMerged);
});

const printMerged = (err, data) => {
  if (err) {
    console.error('Error reading file:', err);
    return;
  }

  // Split the data into an array of lines
  const localIndexLines = localIndex.split('\n');
  const globalIndexLines = data.split('\n');

  localIndexLines.pop();
  globalIndexLines.pop();

  const local = {};
  const global = {};

  // 3. For each line in `localIndexLines`, parse them and add them to the `local` object
  // where keys are terms and values store a url->freq map (one entry per url).
  for (const line of localIndexLines) {
    const lst = line.split('|');
    const word = lst[0];
    const frequency = lst[1];
    const url = lst[2];
    const map = {};
    map[url.trim()] = Number(frequency.trim());
    local[word.trim()] = map;
  }

  // 4. For each line in `globalIndexLines`, parse them and add them to the `global` object
  // where keys are terms and values are url->freq maps (one entry per url).
  // Use the .trim() method to remove leading and trailing whitespace from a string.
  for (const line of globalIndexLines) {
    const lst = line.split('|');
    const term = lst[0];
    const listing = lst[1];
    const maps = listing
        .trim()
        .split(' ')
        .filter((item) => item !== '');
    const grouped = {};
    for (let i = 0; i < maps.length - 1; i += 2) {
      const url = maps[i].trim();
      const freq = maps[i + 1].trim();
      if (!(url in grouped)) {
        grouped[url] = 0;
      }
      grouped[url] += Number(freq);
    }
    global[term.trim()] = grouped; // Map<url, freq>
  }

  // 5. Merge the local index into the global index:
  // - For each term in the local index, if the term exists in the global index:
  //     - Merge by url so there is at most one entry per url.
  //     - Sum frequencies for duplicate urls.
  // - If the term does not exist in the global index:
  //     - Add it as a new entry with the local index's data.
  Object.keys(local).forEach((term) => {
    if (term in global) {
      const globalMap = global[term];
      const localMap = local[term];
      for (const url in localMap) {
        if (url in globalMap) {
          globalMap[url] += localMap[url];
        } else {
          globalMap[url] = localMap[url];
        }
      }
    } else {
      global[term] = local[term];
    }
  });

  // 6. Print the merged index to the console in the same format as the global index file:
  //    - Each line contains a term, followed by a pipe (`|`), followed by space-separated pairs of `url` and `freq`.
  //    - Terms should be printed in alphabetical order.
  const termsList = Object.keys(global).sort();
  const valsList = Object.values(global);
  valsList.sort(compare);
  for (const term of termsList) {
    let line = '';
    line += term + ' |';
    const map = global[term];
    const entries = Object.entries(map)
        .map(([url, freq]) => ({url, freq}))
        .sort(compare);
    // map.sort(compare);
    // for (const url in map) {
    //   line += " " + url + " " + map[url];
    // }
    for (const entry of entries) {
      line += ' ' + entry.url + ' ' + entry.freq;
    }
    console.log(line);
  }
};
