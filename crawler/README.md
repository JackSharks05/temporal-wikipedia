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
Each article is output in this format:

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
## Option A: Stream from dump
```javascript
processDump('dump.xml.bz2', {
  onArticle: (article) => {
    // Index this article
  }
});
```
## Option B: Load from JSON files
```bash
node crawler/dumpProcessor.js dump.bz2 --output ./data
// Then read JSON files
```

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