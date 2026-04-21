#!/usr/bin/env bash
#
# Fan out scripts/indexSizeLocal.js to every node, then aggregate
# per-prefix counts / bytes / avg-entry across the cluster.

KEY="../csci1380.pem"
IP_FILE="aws_ips.txt"
REMOTE_SCRIPT="temporal-wikipedia/scripts/indexSizeLocal.js"

if [[ ! -f "$IP_FILE" ]]; then
  echo "Error: $IP_FILE not found."
  exit 1
fi

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

for ip in $(grep -v '^#' "$IP_FILE" | grep -v '^$'); do
  (
    err=$(ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 \
          -o BatchMode=yes -i "$KEY" ubuntu@"$ip" \
          "node $REMOTE_SCRIPT" \
          2> "$tmpdir/$ip.err" > "$tmpdir/$ip.json")
    bytes=$(wc -c < "$tmpdir/$ip.json" | tr -d ' ')
    if [[ "$bytes" -eq 0 ]]; then
      echo "[$ip] EMPTY  stderr: $(head -c 200 "$tmpdir/$ip.err" | tr -d '\n')" >&2
    else
      echo "[$ip] OK ($bytes bytes)" >&2
    fi
  ) &
done

wait

node -e '
const fs = require("fs");
const path = require("path");

const dir = process.argv[1];
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));

// Group prefixes so output separates crawl/storage from index outputs.
const STORAGE = new Set([
  "article-year-history",
  "article-meta",
  "article-manifest",
  "article-segment",
  "article-title",
  "page",
]);
const INDEX = new Set([
  "diff",
  "tfidf",
  "birth",
  "death",
  "definition",
  "cooc",
  "editcadence",
  "editfreq",
  "embedding",
  "align",
  "drift",
]);

const agg = {};
let nodeCount = 0;

function human(b) {
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return i === 0 ? b + u[i] : b.toFixed(2) + u[i];
}

for (const f of files) {
  const raw = fs.readFileSync(path.join(dir, f), "utf8");
  if (!raw.trim()) continue;
  let data;
  try { data = JSON.parse(raw); } catch { continue; }
  nodeCount++;
  for (const [prefix, {bytes, count}] of Object.entries(data)) {
    if (!agg[prefix]) agg[prefix] = {bytes: 0, count: 0};
    agg[prefix].bytes += bytes;
    agg[prefix].count += count;
  }
}

console.error("[aggregate] " + nodeCount + " / " + files.length + " nodes reported");

function printTable(title, rows) {
  if (rows.length === 0) return;
  console.log();
  console.log("== " + title + " ==");
  const prefixWidth = Math.max(...rows.map(([p]) => p.length), "PREFIX".length);
  console.log(
      "PREFIX".padEnd(prefixWidth),
      "COUNT".padStart(12),
      "BYTES".padStart(14),
      "AVG/ENTRY".padStart(12),
  );
  console.log("-".repeat(prefixWidth + 12 + 14 + 12 + 3));
  let subBytes = 0, subCount = 0;
  for (const [prefix, {bytes, count}] of rows) {
    const avg = count > 0 ? bytes / count : 0;
    console.log(
        prefix.padEnd(prefixWidth),
        String(count.toLocaleString()).padStart(12),
        human(bytes).padStart(14),
        human(avg).padStart(12),
    );
    subBytes += bytes;
    subCount += count;
  }
  console.log("-".repeat(prefixWidth + 12 + 14 + 12 + 3));
  console.log(
      "subtotal".padEnd(prefixWidth),
      String(subCount.toLocaleString()).padStart(12),
      human(subBytes).padStart(14),
  );
}

const entries = Object.entries(agg).filter(([p]) => p !== "_total");

const storageRows = entries
    .filter(([p]) => STORAGE.has(p))
    .sort((a, b) => b[1].bytes - a[1].bytes);

const indexRows = entries
    .filter(([p]) => INDEX.has(p))
    .sort((a, b) => b[1].bytes - a[1].bytes);

const otherRows = entries
    .filter(([p]) => !STORAGE.has(p) && !INDEX.has(p))
    .sort((a, b) => b[1].bytes - a[1].bytes);

printTable("crawl / storage", storageRows);
printTable("indexes", indexRows);
if (otherRows.length > 0) printTable("other / unclassified", otherRows);

const t = agg._total || {bytes: 0, count: 0};
console.log();
console.log("TOTAL: " + t.count.toLocaleString() + " files, " + human(t.bytes));
' "$tmpdir"
