#!/usr/bin/env node

/*
Extract all text from an HTML page.
Usage: input > ./getText.js > output
*/

const {convert} = require('html-to-text');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
});

let content = '';

rl.on('line', (line) => {
  // 1. Read HTML input from standard input, line by line using the `readline` module.
  content += line + '\n';
});

// 2. after all input is received, use convert to output plain text.
rl.on('close', () => {
  const text = convert(content);
  console.log(text);
});
