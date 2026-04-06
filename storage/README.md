## Segment Format

Each article is split into chunks of 50 revisions (to reduce storage without having super long retreival from huge lists of revisions):

```text
article-segment:<pageId>:0 -> revisions 0-49
article-segment:<pageId>:1 -> revisions 50-99
article-segment:<pageId>:2 -> revisions 100-149
```

Inside each segment, the first revision is stored in full as `base`. The rest of the revisions in that segment are stored as patches from the previous revision.
 

## Stored Keys

```text
article-title:<normalizedTitle>
article-meta:<pageId>
article-manifest:<pageId>
article-segment:<pageId>:<segmentId>
```

The title key maps titles to page ids. The meta key stores summary fields. The manifest stores segment ranges. Each segment stores one 50-revision chunk with a full base revision and patch deltas.

## Main API

```js
const wikiStore = require('./storage/wikiStore');

wikiStore.storeArticle('all', article, callback);
wikiStore.getArticleManifest('all', pageId, callback);
wikiStore.getArticleSegment('all', pageId, segmentId, callback);
```
 
## Ingestion

Use `storage/ingestDumpToStore.js` to parse a dump and write articles to the distributed store:

```bash
node storage/ingestDumpToStore.js path/to/dump.xml --limit 10 --port 9000
```

The script asks the crawler to emit raw revisions, then storage segments them into groups of 50.

## Debugging

Use `storage/checkStoredArticle.js` to inspect a stored article by page id or title:

```bash
node storage/checkStoredArticle.js 12345 --port 9000
node storage/checkStoredArticle.js "Linearization" --title --port 9000
```


