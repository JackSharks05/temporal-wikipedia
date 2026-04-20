#!/usr/bin/env bash

KEY="../csci1380.pem"
IP_FILE="aws_ips.txt"


for ip in $(grep -v '^#' "$IP_FILE" | grep -v '^$'); do
  (
    ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -i "$KEY" ubuntu@"$ip" \
      "tmux kill-session -t worker 2>/dev/null; cd temporal-wikipedia && git pull origin aws && tmux new-session -d -s worker 'node --max-old-space-size=2560 scripts/startWorker.js'" \
      2>/dev/null \
      && echo "[$ip] OK" \
      || echo "[$ip] FAILED"
  ) &
done

wait
echo "Done."
