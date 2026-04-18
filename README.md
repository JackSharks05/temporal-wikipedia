
## Storage Ingestion

Parse a Wikipedia dump and store article histories as 50-revision delta segments:

```bash
node storage/ingestDumpToStore.js path/to/dump.xml --limit 10 --port 9000
```

Inspect a stored article manifest:

```bash
node storage/checkStoredArticle.js "Linearization" --title --port 9000
```

The local store is namespaced by node identity, so use the same `--ip` and `--port` when checking data that you used during ingestion.


aws ec2 describe-instances --filters "Name=private-ip-address,Values=172.31.17.78" --query "Reservations[].Instances[].PublicIpAddress" --output text
aws ec2 describe-instances --query "Reservations[].Instances[].PublicIpAddress" --output text