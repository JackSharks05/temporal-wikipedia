#!/usr/bin/env bash
#
# Quick status check: shows whether each worker is alive and its last few
# lines of tmux output (the most recent stdout from the node process).
#
# Usage:  bash scripts/workerStatus.sh            # default 5 lines
#         bash scripts/workerStatus.sh 20          # last 20 lines per worker

KEY="../csci1380.pem"
IP_FILE="worker_ips.txt"
LINES="${1:-5}"

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
    output=$(ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -o BatchMode=yes \
      -i "$KEY" ubuntu@"$ip" \
      "if pgrep -f startWorker.js >/dev/null; then
         echo STATUS:ALIVE
       else
         echo STATUS:DEAD
       fi
       if tmux has-session -t worker 2>/dev/null; then
         tmux capture-pane -t worker -p -S -${LINES}
       else
         echo '(no tmux session)'
       fi" \
      2>/dev/null)

    if [[ -z "$output" ]]; then
      echo "STATUS:UNREACHABLE" > "$tmpdir/$ip"
    else
      echo "$output" > "$tmpdir/$ip"
    fi
  ) &
done

wait

for f in "$tmpdir"/*; do
  [[ -f "$f" ]] || continue
  ip=$(basename "$f")
  content=$(cat "$f")
  status_line=$(echo "$content" | grep '^STATUS:' | head -1)
  status="${status_line#STATUS:}"

  case "$status" in
    ALIVE)       label="ALIVE" ;;
    DEAD)        label="DEAD " ;;
    *)           label="UNREACHABLE" ;;
  esac

  echo "=== [$label] $ip ==="
  echo "$content" | grep -v '^STATUS:'
  echo ""
done | sort -t'[' -k2
