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

function repeatReplace(text, regex, replacement) {
  let prev;
  do {
    prev = text;
    text = text.replace(regex, replacement);
  } while (text !== prev);
  return text;
}

function stripMarkup(text) {
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  text = text.replace(/<ref\b[^>]*\/>/gi, '');
  text = text.replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, '');
  text = repeatReplace(text, /\{\{[^{}]*\}\}/g, '');
  text = repeatReplace(text, /\{\|[\s\S]*?\|\}/g, '');
  text = repeatReplace(text,
      /\[\[(?:File|Image|Category):[^\[\]]*(?:\[\[[^\[\]]*\]\][^\[\]]*)*\]\]/gi, '');
  text = text.replace(/\[\[([^\[\]|]+)\|([^\[\]]+)\]\]/g, '$2');
  text = text.replace(/\[\[([^\[\]]+)\]\]/g, '$1');
  text = text.replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, '$1');
  text = text.replace(/\[https?:\/\/\S+\]/g, '');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/'''''|'''|''/g, '');
  text = text.replace(/\(\s*[;,\s]*\)/g, '');

  return text;
}

function extractFirstParagraph(text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.length < 10) continue;
    if (/^[#*:;|=!\-]/.test(line)) continue;

    let paragraph = line;
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j].trim();
      if (!next || /^[=#*:;|]/.test(next)) break;
      paragraph += ' ' + next;
    }
    return paragraph.replace(/\s+/g, ' ').trim();
  }
  return null;
}

function extractFirstSentence(paragraph) {
  for (let i = 0; i < paragraph.length; i++) {
    const c = paragraph[i];
    if (c !== '.' && c !== '!' && c !== '?') continue;

    const after = paragraph[i + 1];
    if (after && after !== ' ') continue;

    let j = i + 2;
    while (j < paragraph.length && paragraph[j] === ' ') j++;
    if (j < paragraph.length && !/[A-Z"(\[]/.test(paragraph[j])) continue;

    let ws = i;
    while (ws > 0 && paragraph[ws - 1] !== ' ') ws--;
    const word = paragraph.slice(ws, i).toLowerCase();
    if (ABBREV.has(word)) continue;

    return paragraph.slice(0, i + 1).trim();
  }
  return null;
}

function parseFirstSentence(wikitext) {
  if (!wikitext) return null;
  const stripped = stripMarkup(wikitext);
  const paragraph = extractFirstParagraph(stripped);
  if (!paragraph) return null;
  const sentence = extractFirstSentence(paragraph);
  if (sentence) return sentence;
  return paragraph.length > 500 ? paragraph.slice(0, 500) + '…' : paragraph;
}


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