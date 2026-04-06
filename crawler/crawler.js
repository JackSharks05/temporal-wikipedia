/**
 * Crawler
 */

const fs = require('fs');
const path = require('path');
const {Transform} = require('stream'); // modify data on-the-fly as it passes from a readable source to a writable destination
const sax = require('sax'); // third-party event-based XML parser, process large XML files chunk-by-chunk without loading the entire file into memory
const Diff = require('diff');

// =========Config=======
const CONFIG = {
  // skip non-article pages
  skipPrefixes: [
    'Wikipedia:', 'User:', 'Talk:', 'User talk:', 'File:', 'File talk:',
    'Template:', 'Template talk:', 'Category:', 'Category talk:',
    'Portal:', 'Portal talk:', 'Draft:', 'Draft talk:', 'Module:',
    'Module talk:', 'MediaWiki:', 'MediaWiki talk:', 'Help:', 'Help talk:',
    'Book:', 'Book talk:', 'TimedText:', 'TimedText talk:',
  ],
  batchSize: 100, // for storing articles
  progressInterval: 1000, // progress reporting interval
};

/**
 * 
check if it is a content article 
 */
function shouldProcess(title, content) {
  if (!title || !content) return false;
  // 1. skip namespace pages
  for (const prefix of CONFIG.skipPrefixes) {
    if (title.startsWith(prefix)) return false;
  }
  // 2. skip redirects
  if (content.trim().toLowerCase().startsWith('#redirect')) return false;
  return true;
}

function extractPlainText(wikitext) {
  if (!wikitext) return '';
  let text = wikitext;
  // remove templates {{...}}
  text = text.replace(/\{\{[^}]*\}\}/g, '');
  // remove references <ref>...</ref>
  text = text.replace(/<ref[^>]*>.*?<\/ref>/gs, '');
  text = text.replace(/<ref[^>]*\/>/g, '');
  // remove HTML tags
  text = text.replace(/<[^>]+>/g, '');
  // convert links [[Link|Text]] to Text, [[Link]] to Link
  text = text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2');
  text = text.replace(/\[\[([^\]]+)\]\]/g, '$1');
  // remove external links [http://... text]
  text = text.replace(/\[https?:\/\/[^\s\]]+\s*([^\]]*)\]/g, '$1');
  // remove bold/italic markers
  text = text.replace(/'{2,5}/g, '');
  // remove category links
  text = text.replace(/\[\[Category:[^\]]+\]\]/gi, '');
  // remove file/image links
  text = text.replace(/\[\[(File|Image):[^\]]+\]\]/gi, '');
  // clean up whitespace
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.trim();
  return text;
}

/**
 * extract internal wiki links from wikitext
 */
function extractLinks(wikitext) {
  if (!wikitext) return [];

  const links = [];
  const regex = /\[\[([^\]|#]+)(?:[|#][^\]]+)?\]\]/g;
  let match;

  while ((match = regex.exec(wikitext)) !== null) {
    const link = match[1].trim();

    // skip non-article links
    let skip = false;
    for (const prefix of CONFIG.skipPrefixes) {
      if (link.startsWith(prefix)) {
        skip = true;
        break;
      }
    }

    if (!skip && link && !links.includes(link)) {
      links.push(link);
    }
  }

  return links;
}

/**
 *  delta encode revisions to save space 
 */
function deltaEncode(revisions) {
  if (!revisions || revisions.length === 0) {
    return {base: null, deltas: []};
  }

  // oldest first
  revisions.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const base = {
    revId: revisions[0].revId,
    timestamp: revisions[0].timestamp,
    content: revisions[0].content || '',
  };

  const deltas = [];

  for (let i = 1; i < revisions.length; i++) {
    const prevContent = revisions[i - 1].content || '';
    const currContent = revisions[i].content || '';

    // create unified diff patch
    const patch = Diff.createPatch(
        `rev-${revisions[i].revId}`,
        prevContent,
        currContent,
        revisions[i - 1].timestamp,
        revisions[i].timestamp,
    );

    deltas.push({
      revId: revisions[i].revId,
      parentId: revisions[i].parentId,
      timestamp: revisions[i].timestamp,
      patch: patch,
    });
  }

  return {base, deltas};
}

function reconstructAtRevision(article, targetRevId) {
  if (!article.base) return null;

  let content = article.base.content;

  if (article.base.revId === targetRevId) {
    return content;
  }

  for (const delta of article.deltas) {
    content = Diff.applyPatch(content, delta.patch);
    if (delta.revId === targetRevId) {
      return content;
    }
  }

  return content; // return latest if not found
}

function reconstructAtDate(article, targetDate) {
  if (!article.base) return null;

  const target = new Date(targetDate);
  let content = article.base.content;
  let lastTimestamp = article.base.timestamp;

  if (new Date(article.base.timestamp) > target) {
    return null; // the article didn't exist yet
  }

  for (const delta of article.deltas) {
    if (new Date(delta.timestamp) <= target) {
      content = Diff.applyPatch(content, delta.patch);
      lastTimestamp = delta.timestamp;
    } else {
      break;
    }
  }

  return {content, timestamp: lastTimestamp};
}

/**
 * streaming xml parser for dumps
 */
class WikiDumpParser extends Transform {
  constructor(options = {}) {
    super({objectMode: true});

    this.saxParser = sax.parser(true, {trim: false, normalize: false}); // strict mode XML parser, keeping whitespace
    this.currentPage = null;
    this.currentRevision = null;
    this.currentTag = ''; // xml tag
    this.textBuffer = '';
    this.pageCount = 0;
    this.articleCount = 0;
    this.limit = options.limit || Infinity;
    this.maxRevisions = options.maxRevisions || 50; // limit revisions per article

    this._setupSaxHandlers();
  }

  _setupSaxHandlers() {
    this.saxParser.onopentag = (node) => {
      // <page> or <revison>
      this.currentTag = node.name;

      if (node.name === 'page') {
        this.currentPage = {
          title: '',
          pageId: '',
          revisions: [],
        };
      } else if (node.name === 'revision') {
        this.currentRevision = {
          revId: '',
          parentId: '',
          timestamp: '',
          content: '',
        };
      }

      this.textBuffer = '';
    };

    this.saxParser.ontext = (text) => {
      this.textBuffer += text;
    };

    this.saxParser.oncdata = (cdata) => {
      this.textBuffer += cdata;
    };

    this.saxParser.onclosetag = (name) => {
      const text = this.textBuffer;

      if (this.currentRevision) {
        switch (name) {
          case 'id':
            if (!this.currentRevision.revId) {
              this.currentRevision.revId = text.trim();
            }
            break;
          case 'parentid':
            this.currentRevision.parentId = text.trim();
            break;
          case 'timestamp':
            this.currentRevision.timestamp = text.trim();
            break;
          case 'text':
            this.currentRevision.content = text;
            break;
          case 'revision':
            if (this.currentPage) {
              // limit revisions to avoid memory issues
              if (this.currentPage.revisions.length < this.maxRevisions) {
                this.currentPage.revisions.push(this.currentRevision);
              } else {
                // replace oldest with newest
                this.currentPage.revisions.shift();
                this.currentPage.revisions.push(this.currentRevision);
              }
            }
            this.currentRevision = null;
            break;
        }
      } else if (this.currentPage) {
        switch (name) {
          case 'title':
            this.currentPage.title = text.trim();
            break;
          case 'id':
            if (!this.currentPage.pageId) {
              this.currentPage.pageId = text.trim();
            }
            break;
          case 'page':
            this._emitPage();
            this.currentPage = null;
            break;
        }
      }

      this.textBuffer = '';
      this.currentTag = '';
    };

    this.saxParser.onerror = (err) => {
      console.error('SAX Parser error:', err);
      this.saxParser.resume();
    };
  }

  _emitPage() {
    // when </page> is reached 
    if (!this.currentPage) return;

    this.pageCount++;

    const {title, revisions} = this.currentPage;
    const latestContent = revisions.length > 0 ?
      revisions[revisions.length - 1].content : '';

    if (shouldProcess(title, latestContent)) {
      this.articleCount++;

      if (this.articleCount <= this.limit) {
        // delta encodes revisinos
        const encoded = deltaEncode(revisions);

        // extract links from latest revision
        const links = extractLinks(latestContent);

        const article = {
          title: this.currentPage.title,
          pageId: this.currentPage.pageId,
          base: encoded.base,
          deltas: encoded.deltas,
          links: links,
          revisionCount: revisions.length,
        };

        this.push(article);
      }
    }

    // console log progress
    if (this.pageCount % CONFIG.progressInterval === 0) {
      console.log(`Processed ${this.pageCount} pages, ${this.articleCount} articles`);
    }
  }

  _transform(chunk, encoding, callback) {
    try {
      this.saxParser.write(chunk.toString());
      callback(); // ready for next chunk 
    } catch (err) {
      callback(err);
    }
  }

  _flush(callback) {
    try {
      this.saxParser.close();
      console.log(`\nFinished: ${this.pageCount} pages, ${this.articleCount} articles`);
      callback();
    } catch (err) {
      callback(err);
    }
  }
}

/**
 * process a dump file
 */
async function processDump(dumpPath, options = {}) {
  const {onArticle, onComplete, limit} = options;
  return new Promise((resolve, reject) => {
    let inputStream;
    // unzip
    if (dumpPath.endsWith('.bz2')) {
      try {
        const bz2 = require('unbzip2-stream');
        inputStream = fs.createReadStream(dumpPath).pipe(bz2());
      } catch (err) {
        console.error('Error: unbzip2-stream not installed. Run: npm install unbzip2-stream');
        reject(err);
        return;
      }
    } else if (dumpPath.endsWith('.gz')) {
      const zlib = require('zlib');
      inputStream = fs.createReadStream(dumpPath).pipe(zlib.createGunzip());
    } else {
      inputStream = fs.createReadStream(dumpPath);
    }
    
    const parser = new WikiDumpParser({limit});
    const articles = [];

    parser.on('data', (article) => {
      if (onArticle) {
        onArticle(article);
      } else {
        articles.push(article);
      }
    });

    parser.on('end', () => {
      if (onComplete) {
        onComplete(articles);
      }
      resolve(articles);
    });

    parser.on('error', (err) => {
      reject(err);
    });

    inputStream.pipe(parser);
  });
}

function saveToJson(articles, outputDir) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, {recursive: true});
  }

  articles.forEach((article, index) => {
    const filename = `article_${index}_${article.title.replace(/[/\\?%*:|"<>]/g, '_')}.json`;
    const filepath = path.join(outputDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(article, null, 2));
  });

  console.log(`Saved ${articles.length} articles to ${outputDir}`);
}

// Export functions for use in other modules
module.exports = {
  processDump,
  deltaEncode,
  reconstructAtRevision,
  reconstructAtDate,
  extractPlainText,
  extractLinks,
  shouldProcess,
  WikiDumpParser,
  saveToJson,
  CONFIG,
};

/**
 * CLI interface
 */
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Wikipedia Dump Processor

Usage:
  node dumpProcessor.js <dump-file.xml[.bz2|.gz]> [options]

Options:
  --limit N       Process only first N articles
  --output DIR    Save articles to JSON files in DIR

Examples:
  node dumpProcessor.js enwiki-latest-pages-articles.xml.bz2 --limit 100
  node dumpProcessor.js sample.xml --output ./output
    `);
    process.exit(0);
  }

  const dumpPath = args[0];
  let limit = Infinity;
  let outputDir = null;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      outputDir = args[i + 1];
      i++;
    }
  }

  console.log(`Processing: ${dumpPath}`);
  if (limit < Infinity) console.log(`Limit: ${limit} articles`);

  processDump(dumpPath, {limit})
      .then((articles) => {
        console.log(`\nProcessed ${articles.length} articles`);

        if (outputDir) {
          saveToJson(articles, outputDir);
        } else {
          // print summary
          console.log('\nSample articles:');
          articles.slice(0, 3).forEach((a) => {
            console.log(`  - ${a.title} (${a.revisionCount} revisions, ${a.links.length} links)`);
          });
        }
      })
      .catch((err) => {
        console.error('Error processing dump:', err);
        process.exit(1);
      });
}

