const YEARS = [
  2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009,
  2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019,
  2020, 2021, 2022, 2023, 2024, 2025, 2026,
];

const ABBREV = new Set([
  'u.s', 'u.k', 'mr', 'mrs', 'ms', 'dr', 'jr', 'sr', 'st',
  'prof', 'sen', 'rep', 'rev', 'gen', 'ph.d', 'b.c', 'a.d',
  'e.g', 'i.e', 'etc', 'vs', 'inc', 'ltd', 'co', 'corp', 'no',
]);

/**
 * Extract the first prose sentence of a Wikipedia article from its wikitext.
 * Returns a plaintext string or null if no prose could be found.
 */
function parseFirstSentence(wikitext) {
  if (!wikitext) return null;
  let text = wikitext;

  // HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // <ref>...</ref> and self-closing <ref ... />
  text = text.replace(/<ref\b[^>]*\/>/gi, '');
  text = text.replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, '');

  let prev;
  do { prev = text; text = text.replace(/\{\{[^{}]*\}\}/g, ''); } while (text !== prev);

  // Tables {|...|}
  do { prev = text; text = text.replace(/\{\|[\s\S]*?\|\}/g, ''); } while (text !== prev);

  // File / Image / Category links (nested caption-friendly)
  do {
    prev = text;
    text = text.replace(
        /\[\[(?:File|Image|Category):[^\[\]]*(?:\[\[[^\[\]]*\]\][^\[\]]*)*\]\]/gi, '');
  } while (text !== prev);

  // [[Link|text]] -> text,  [[Link]] -> Link
  text = text.replace(/\[\[([^\[\]|]+)\|([^\[\]]+)\]\]/g, '$2');
  text = text.replace(/\[\[([^\[\]]+)\]\]/g, '$1');

  text = text.replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, '$1');
  text = text.replace(/\[https?:\/\/\S+\]/g, '');

  // HTML tags
  text = text.replace(/<[^>]+>/g, '');

  text = text.replace(/'''''/g, '').replace(/'''/g, '').replace(/''/g, '');
  text = text.replace(/\(\s*[;,\s]*\)/g, '');
  const lines = text.split('\n');
  let paragraph = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/^[#*:;|=!\-]/.test(line)) continue;
    if (line.length < 10) continue;

    paragraph = line;
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j];
      if (!next.trim()) break;
      if (/^[=#*:;|]/.test(next.trim())) break;
      paragraph += ' ' + next.trim();
    }
    break;
  }

  if (!paragraph) return null;
  paragraph = paragraph.replace(/\s+/g, ' ').trim();

  for (let i = 0; i < paragraph.length; i++) {
    const c = paragraph[i];
    if (c !== '.' && c !== '!' && c !== '?') continue;

    const after = paragraph[i + 1];
    if (after && after !== ' ') continue; // decimal or mid-abbrev

    let j = i + 2;
    while (j < paragraph.length && paragraph[j] === ' ') j++;
    if (j < paragraph.length && !/[A-Z"(\[]/.test(paragraph[j])) continue;
    let ws = i;
    while (ws > 0 && paragraph[ws - 1] !== ' ') ws--;
    const word = paragraph.slice(ws, i).toLowerCase();
    if (ABBREV.has(word)) continue;

    return paragraph.slice(0, i + 1).trim();
  }

  return paragraph.length > 500 ? paragraph.slice(0, 500) + '…' : paragraph;
}

/**
 * MR mapper: per article, emit one entry per year that has a year-end snapshot.
 */
function mapArticle(key, data, ctx) {
  const gid = ctx && ctx.gid;
  if (!gid) {
    console.log(`[defn] skipping key=${key}: ctx.gid missing`);
    return [];
  }
  if (!data || !data.years || typeof data.years !== 'object') {
    console.log(`[defn] skipping key=${key}: data.years missing`);
    return [];
  }

  const title = data.title || '';
  const emitted = [];

  for (const year of YEARS) {
    const wikitext = data.years[String(year)];
    if (!wikitext) continue;
    const sentence = parseFirstSentence(wikitext);
    if (!sentence) continue;
    emitted.push({[`${year}:${title}`]: sentence});
  }

  return emitted;
}

module.exports = {mapArticle, parseFirstSentence};

if (require.main == module) {
    print()
}
