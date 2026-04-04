# Export Functions for use in other modules
- processDump | process a dump file 
- deltaEncode | delta encode revisions to save space 
- reconstructAtRevision | apply deltas to reconstruct content at a specific revision 
- reconstructAtDate | apply deltas to reconstruct content at a specific date 
- extractPlainText | extract plain text from wikitext markup
- extractLinks | extract internal wiki links from wikitext 
- shouldProcess | check if an article is a content article 
- WikiDumpParser | streaming xml parser for dumps 
- saveToJson


# Quick Start
## CML
```bash
# Process a Wikipedia dump (supports .xml, .xml.bz2, .xml.gz)
node crawler/dumpProcessor.js <dump-file> [options]
```

## Options
`--limit N` | Process only first N articles
`--output DIR` | Save articles as JSON files to DIR |

## In code
```javascript
const {
  processDump,
  reconstructAtDate,
  reconstructAtRevision,
  extractPlainText,
  extractLinks,
} = require('./crawler/dumpProcessor');
```