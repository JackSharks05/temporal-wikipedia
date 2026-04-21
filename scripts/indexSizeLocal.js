#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || path.join(__dirname, '..', 'store');

const KNOWN_PREFIXES = [
  // crawl / storage
  'article-year-history:',
  'article-meta:',
  'article-manifest:',
  'article-segment:',
  'article-title:',
  'page:',
  // index outputs
  'diff:',
  'tfidf:',
  'birth:',
  'death:',
  'definition:',
  'cooc:',
  'editcadence:',
  'editfreq:',
  'embedding:',
  'align:',
  'drift:',
];

function prefixOf(key) {
  if (typeof key !== 'string') return '(other)';
  for (const p of KNOWN_PREFIXES) {
    if (key.startsWith(p)) return p.replace(/:$/, '');
  }
  const firstColon = key.indexOf(':');
  return firstColon === -1 ? '(other)' : key.slice(0, firstColon);
}

function extractKey(raw) {
  const m = raw.match(/"key"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (!m) return null;
  try {
    return JSON.parse(`"${m[1]}"`);
  } catch {
    return m[1];
  }
}

function* walkFiles(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, {withFileTypes: true});
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(full);
    else if (entry.isFile()) yield full;
  }
}

const byPrefix = new Map();
let totalBytes = 0;
let totalFiles = 0;

for (const file of walkFiles(ROOT)) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    continue;
  }
  let raw;
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(Math.min(stat.size, 512));
    fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    raw = buf.toString('utf8');
  } catch {
    continue;
  }

  const key = extractKey(raw);
  const prefix = prefixOf(key);
  const bucket = byPrefix.get(prefix) || {bytes: 0, count: 0};
  bucket.bytes += stat.size;
  bucket.count += 1;
  byPrefix.set(prefix, bucket);
  totalBytes += stat.size;
  totalFiles += 1;
}

const out = {};
for (const [prefix, {bytes, count}] of byPrefix) {
  out[prefix] = {bytes, count};
}
out._total = {bytes: totalBytes, count: totalFiles};
process.stdout.write(JSON.stringify(out));
