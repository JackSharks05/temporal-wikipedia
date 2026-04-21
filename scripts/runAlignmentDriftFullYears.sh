#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -lt 2 ]]; then
  echo "usage: $0 <year1> <year2> [year3 ...]"
  exit 1
fi

years=("$@")
pairs=$(( ${#years[@]} - 1 ))

echo "YEARS_COUNT=${#years[@]}"
echo "PAIR_COUNT=${pairs}"

for ((i=0; i<pairs; i++)); do
  a="${years[$i]}"
  b="${years[$((i+1))]}"
  step=$((i+1))

  echo "[${step}/${pairs}] ALIGN ${a}->${b}"
  node --max-old-space-size=6000 indexer/alignment/index.js \
    --gid wiki \
    --nodes-file nodes.txt \
    --base-year "${a}" \
    --target-year "${b}"

  echo "[${step}/${pairs}] DRIFT ${a}->${b}"
  node --max-old-space-size=6000 indexer/drift/index.js \
    --gid wiki \
    --nodes-file nodes.txt \
    --base-year "${a}" \
    --target-year "${b}"
done

echo "FULL_ALIGN_DRIFT_DONE pairs=${pairs}"
