#!/usr/bin/env bash
KEY="../csci1380.pem"
IP_FILE="worker_ips.txt"

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
    result=$(ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -i "$KEY" ubuntu@"$ip" "df -h / | tail -1" 2>/dev/null)
    if [[ -n "$result" ]]; then
      echo "[$ip] $result"
    else
      echo "[$ip] FAILED"
    fi
  ) &
done

wait
