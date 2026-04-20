#!/usr/bin/env bash

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
    ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -i "$KEY" ubuntu@"$ip" \
        "node $REMOTE_SCRIPT" 2>/dev/null > "$tmpdir/$ip.json"
  ) &
done

wait

node -e '
const fs = require("fs");
const path = require("path");

const dir = process.argv[1];
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));

const agg = {};

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
  for (const [prefix, {bytes, count}] of Object.entries(data)) {
    if (!agg[prefix]) agg[prefix] = {bytes: 0, count: 0};
    agg[prefix].bytes += bytes;
    agg[prefix].count += count;
  }
}

const rows = Object.entries(agg)
    .filter(([p]) => p !== "_total")
    .sort((a, b) => b[1].bytes - a[1].bytes);

const prefixWidth = Math.max(...rows.map(([p]) => p.length), "PREFIX".length);

console.log(
    "PREFIX".padEnd(prefixWidth),
    "COUNT".padStart(12),
    "BYTES".padStart(14),
    "AVG/ENTRY".padStart(12),
);
console.log("-".repeat(prefixWidth + 12 + 14 + 12 + 3));

for (const [prefix, {bytes, count}] of rows) {
  const avg = count > 0 ? bytes / count : 0;
  console.log(
      prefix.padEnd(prefixWidth),
      String(count.toLocaleString()).padStart(12),
      human(bytes).padStart(14),
      human(avg).padStart(12),
  );
}

const t = agg._total || {bytes: 0, count: 0};
console.log("-".repeat(prefixWidth + 12 + 14 + 12 + 3));
console.log(
    "TOTAL".padEnd(prefixWidth),
    String(t.count.toLocaleString()).padStart(12),
    human(t.bytes).padStart(14),
);
' "$tmpdir"
