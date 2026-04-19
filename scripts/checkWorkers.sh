#!/usr/bin/env bash
#
# Health-check every worker listed in worker_ips.txt.
# Reports which workers have a live startWorker.js process and which are dead.
# Exits 1 if any worker is dead (useful for scripting).
#
# Usage:  bash scripts/checkWorkers.sh

KEY="../csci1380.pem"
IP_FILE="${1:-aws_ips.txt}"

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
    result=$(ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -o BatchMode=yes \
      -i "$KEY" ubuntu@"$ip" \
      'pgrep -f startWorker.js >/dev/null && echo ALIVE || echo DEAD' \
      2>/dev/null)
    if [[ "$result" == "ALIVE" ]]; then
      echo "ALIVE $ip" > "$tmpdir/$ip"
    elif [[ "$result" == "DEAD" ]]; then
      echo "DEAD $ip" > "$tmpdir/$ip"
    else
      echo "UNREACHABLE $ip" > "$tmpdir/$ip"
    fi
  ) &
done

wait

alive=0
dead=0
unreachable=0

for f in "$tmpdir"/*; do
  line=$(cat "$f")
  status="${line%% *}"
  ip="${line#* }"
  case "$status" in
    ALIVE)       echo "[ALIVE     ] $ip"; alive=$((alive+1)) ;;
    DEAD)        echo "[DEAD      ] $ip"; dead=$((dead+1)) ;;
    UNREACHABLE) echo "[UNREACHABLE] $ip"; unreachable=$((unreachable+1)) ;;
  esac
done | sort

echo "---"
echo "Alive: $alive   Dead: $dead   Unreachable: $unreachable"

if [[ "$dead" -gt 0 || "$unreachable" -gt 0 ]]; then
  echo ""
  echo "Fix with:  bash scripts/startAllWorkers.sh"
  exit 1
fi

exit 0
