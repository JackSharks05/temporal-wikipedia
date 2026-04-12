#!/usr/bin/env bash
#
# SSH into each worker, pull latest code, and start the worker process.
# Runs each worker in a remote tmux session so it persists after disconnect.
#
# Usage:
#   bash scripts/startAllWorkers.sh [--key PATH] [--file worker_ips.txt] [--kill]
#
# Flags:
#   --key   Path to SSH .pem key (default: ../csci1380.pem)
#   --file  File with one public IP per line (default: worker_ips.txt)
#   --kill  Kill existing worker tmux sessions before starting

KEY="../csci1380.pem"
IP_FILE="worker_ips.txt"
KILL_FIRST=false
USER="ubuntu"
REPO_DIR="temporal-wikipedia"
BRANCH="aws"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --key) KEY="$2"; shift 2;;
    --file) IP_FILE="$2"; shift 2;;
    --kill) KILL_FIRST=true; shift;;
    *) echo "Unknown flag: $1"; exit 1;;
  esac
done

if [[ ! -f "$IP_FILE" ]]; then
  echo "Error: $IP_FILE not found"
  echo "Create it with one public IP per line (no port)."
  exit 1
fi

if [[ ! -f "$KEY" ]]; then
  echo "Error: SSH key not found at $KEY"
  exit 1
fi

IPS=()
while IFS= read -r line; do
  line=$(echo "$line" | sed 's/#.*//' | xargs)
  [[ -z "$line" ]] && continue
  IPS+=("$line")
done < "$IP_FILE"

echo "Starting workers on ${#IPS[@]} nodes..."

for ip in "${IPS[@]}"; do
  echo "[$ip] connecting..."
  (
    SSH_CMD="ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -i $KEY $USER@$ip"

    if $KILL_FIRST; then
      $SSH_CMD "tmux kill-session -t worker 2>/dev/null; true" 2>/dev/null
    fi

    $SSH_CMD "cd $REPO_DIR && git pull origin $BRANCH && tmux new-session -d -s worker 'node scripts/startWorker.js'" 2>/dev/null

    if [[ $? -eq 0 ]]; then
      echo "[$ip] worker started in tmux session 'worker'"
    else
      echo "[$ip] FAILED to start"
    fi
  ) &
done

wait
echo "Done. All workers launched."
echo ""
echo "To check a worker:  ssh -i $KEY $USER@<public-ip> 'tmux attach -t worker'"
echo "To kill all:         bash scripts/startAllWorkers.sh --kill"
