#!/usr/bin/env bash

KEY="../csci1380.pem"
IP_FILE="aws_ips.txt"

if [[ ! -f "$IP_FILE" ]]; then
  echo "Error: $IP_FILE not found."
  exit 1
fi

if [[ ! -f "$KEY" ]]; then
  echo "Error: SSH key not found at $KEY"
  exit 1
fi

for ip in $(grep -v '^#' "$IP_FILE" | grep -v '^$'); do
  (
    ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -i "$KEY" ubuntu@"$ip" \
      "tmux kill-session -t worker 2>/dev/null; cd temporal-wikipedia && git pull origin aws && tmux new-session -d -s worker 'node crawler_year_end/worker.js --nodes-file nodes.txt'" \
      2>/dev/null \
      && echo "[$ip] OK" \
      || echo "[$ip] FAILED"
  ) &
done

wait
echo "Done."
