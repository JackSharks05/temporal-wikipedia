# temporal-wikipedia-merged-progress

This is the clean, pushable project snapshot. It keeps the `ke-implementation-progress` style layout while using the merged best-of-breed distribution library and the first-draft temporal Wikipedia storage layer.

## Layout

- `distribution.js` and `distribution/`: merged distribution library
- `crawler/`: Wikipedia dump parser from the project-progress branch, with an option to emit raw revisions for storage
- `storage/`: 50-revision delta-segment storage format, distributed-store adapter, and storage CLI helpers
- `indexer/`: temporal diff index prototype
- `c/`: older M0-style search engine helper scripts
- `types.js`: article-history typedefs

## Install

```bash
npm install
```

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
