#!/usr/bin/env bash
#
# Remove stale mr-*-map/ intermediate dirs from every node's store.
# Safe only when no indexer job is running.

KEY="../csci1380.pem"
IP_FILE="aws_ips.txt"
MODE="${1:-dry}"   # dry | apply

if [ "$MODE" != "dry" ] && [ "$MODE" != "apply" ]; then
  echo "usage: $0 [dry|apply]"
  exit 1
fi

for ip in $(grep -v '^#' "$IP_FILE" | grep -v '^$'); do
  (
    if [ "$MODE" = "dry" ]; then
      out=$(ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -i "$KEY" ubuntu@"$ip" \
        'cd ~/temporal-wikipedia/store 2>/dev/null && du -sh */mr-*-map 2>/dev/null | awk "{s+=\$1; print} END {print \"TOTAL: \"s\"(approx, units mixed)\"}"' 2>/dev/null)
      echo "[$ip]"
      echo "$out" | sed 's/^/  /'
    else
      out=$(ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -i "$KEY" ubuntu@"$ip" \
        'cd ~/temporal-wikipedia/store 2>/dev/null && before=$(df --output=avail / | tail -1) && rm -rf */mr-*-map && after=$(df --output=avail / | tail -1) && echo "freed $(( (after-before)/1024 )) MB"' 2>/dev/null)
      echo "[$ip] $out"
    fi
  ) &
done

wait
echo "Done."
