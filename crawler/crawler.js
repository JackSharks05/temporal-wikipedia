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

}

function reconstructAtRevision(article, targetRevID) {

}

function reconstructAtDate(article, targetDate) {

}

/**
 * streaming xml parser for dumps
 */
class WikiDumpParser extends Transform {

}

/**
 * process a dump file
 */
async function processDump(dumpPath, options = {}) {

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

