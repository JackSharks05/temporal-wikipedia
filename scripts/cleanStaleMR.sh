#!/usr/bin/env bash
KEY="../csci1380.pem"
IP_FILE="aws_ips.txt"


for ip in $(grep -v '^#' "$IP_FILE" | grep -v '^$'); do
  (
    out=$(ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -i "$KEY" ubuntu@"$ip" \
    'cd ~/temporal-wikipedia/store 2>/dev/null && before=$(df --output=avail / | tail -1) && rm -rf */mr-*-map && after=$(df --output=avail / | tail -1) && echo "freed $(( (after-before)/1024 )) MB"' 2>/dev/null)
    echo "[$ip] $out"
  ) &
done

wait
echo "Done."
