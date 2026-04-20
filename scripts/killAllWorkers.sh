#!/usr/bin/env bash

KEY="../csci1380.pem"
IP_FILE="aws_ips.txt"

for ip in $(grep -v '^#' "$IP_FILE" | grep -v '^$'); do
  (
    ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -i "$KEY" ubuntu@"$ip" \
      "tmux kill-session -t worker" \
      && echo "[$ip] OK" \
      || echo "[$ip] FAILED"
  ) &
done

wait
echo "Done."
