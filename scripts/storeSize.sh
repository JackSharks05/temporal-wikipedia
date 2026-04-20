#!/usr/bin/env bash

KEY="../csci1380.pem"
IP_FILE="aws_ips.txt"
STORE_PATH="${STORE_PATH:-temporal-wikipedia/store}"

if [[ ! -f "$IP_FILE" ]]; then
  echo "Error: $IP_FILE not found."
  exit 1
fi

if [[ ! -f "$KEY" ]]; then
  echo "Error: SSH key not found at $KEY"
  exit 1
fi

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

for ip in $(grep -v '^#' "$IP_FILE" | grep -v '^$'); do
  (
    out=$(ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -i "$KEY" ubuntu@"$ip" \
        "du -sb $STORE_PATH 2>/dev/null | awk '{print \$1}'" 2>/dev/null)
    if [[ -z "$out" ]]; then
      echo "$ip NA" > "$tmpdir/$ip"
    else
      echo "$ip $out" > "$tmpdir/$ip"
    fi
  ) &
done

wait

human() {
  awk -v b="$1" 'BEGIN {
    split("B KB MB GB TB PB", u);
    i = 1;
    while (b >= 1024 && i < 6) { b /= 1024; i++ }
    printf (i == 1 ? "%d%s" : "%.2f%s"), b, u[i];
  }'
}

total=0
printf "%-18s %12s\n" "NODE" "SIZE"
printf "%-18s %12s\n" "------------------" "------------"
for f in "$tmpdir"/*; do
  ip=$(awk '{print $1}' "$f")
  bytes=$(awk '{print $2}' "$f")
  if [[ "$bytes" == "NA" ]]; then
    printf "%-18s %12s\n" "$ip" "(unreachable)"
  else
    total=$((total + bytes))
    printf "%-18s %12s\n" "$ip" "$(human "$bytes")"
  fi
done

printf "%-18s %12s\n" "------------------" "------------"
printf "%-18s %12s\n" "TOTAL" "$(human "$total")"
