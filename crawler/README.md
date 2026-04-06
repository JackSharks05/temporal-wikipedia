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

# Dump Structure Example
please check first500-lines-from-enwiki-dump.txt for reference 
```javascript
<mediawiki>
  <siteinfo>...</siteinfo>     
  
  <page>                        
    <title>Empirical formula</title>
    <ns>0</ns>                   
    <id>10065</id>              
    <redirect title="..." />     
    
    <revision>                  
      <id>110399</id>           
      <parentid>249989</parentid> 
      <timestamp>2002-02-25T15:51:15Z</timestamp>
      <contributor>
        <username>Conversion script</username>
        <id>1226483</id>
      </contributor>
      <comment>Automated conversion</comment>
      <text>In [[chemistry]], the empirical formula...</text>
    </revision>
    
    <revision>...</revision>     
  </page>
  
  <page>...</page>              
</mediawiki>

```
# Output Structure
Each article is output in this format: (please check crawler/crawler-first-5-output for reference)
```javascript
{
  title: "X",           // article title 
  pageId: "8743",       // wikipedia page ID
  base: {               // First (oldest) revision - stored in full
    revId: "100",
    timestamp: "2020-01-01T00:00:00Z",
    content: "sdifjsdnfis..."
  },
  deltas: [                     // subsequent revisions - stored as patches
    {
      revId: "101",
      parentId: "100",
      timestamp: "2020-06-15T12:00:00Z",
      patch: "--- a/...\n+++ b/...\n@@..."  // Unified diff format
    },
    // ... more deltas
  ],
  links: ["Y", "Z"],  // internal wiki links
  revisionCount: 3              // total number of revisions
}
```

# How to use 
## API Reference
### processDump(dumpPath, options)
```javascript
const articles = await processDump('dump.xml.bz2', {
  limit: 1000,                    // optional: max articles to process
  onArticle: (article) => {...},  // optional: callback per article (for streaming)
  onComplete: (articles) => {...} // optional: callback when done
});
```

#### Option B: Load from JSON files
```bash
node crawler/crawler.js dump.bz2 --output ./data
// Then read JSON files
```

### reconstructAtDate(article, targetDate)
```javascript
const result = reconstructAtDate(article, '2015-06-01');
// return: { content: "...", timestamp: "2015-05-28T14:30:00Z" }  OR null 
```

### reconstructAtRevision(article, revisionId)
```javascript
const content = reconstructAtRevision(article, '101');
// return: "Article content at revision 101..."
```

### extractPlainText(wikitext)
removes:
- Bold/italic markers (`'''`, `''`)
- Internal links (`[[Link]]` → `Link`, `[[Link|text]]` → `text`)
- External links
- Templates (`{{...}}`)
- References (`<ref>...</ref>`)
- HTML tags
- Category links
- File/Image links

### extractLinks(wikitext)
extract internal wiki links from wikitext.
```javascript
const links = extractLinks("See [[Twice]] and [[NewJeans]]");
// return ["Twice", "NewJeans""]
```

### deltaEncode(revisions)
delta encode an array of revisions.
```javascript
const encoded = deltaEncode([
  { revId: '1', timestamp: '2020-01-01', content: 'Hello' },
  { revId: '2', timestamp: '2020-06-01', content: 'Hello World' },
]);
// return: { base: {...}, deltas: [{...}] }
```

# Quick Start
## CML
```bash
# Process a Wikipedia dump (supports .xml, .xml.bz2, .xml.gz)
node crawler/crawler.js <dump-file> [options]
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
} = require('./crawler/crawler');
```