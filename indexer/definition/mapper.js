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

function extractPlainText(wikitext) {
  if (!wikitext) return '';
  let text = wikitext;
  text = text.replace(/\[\[Category:[^\]]+\]\]/gi, '');
  text = text.replace(/\[\[(File|Image):[^\]]+\]\]/gi, '');
  text = text.replace(/\{\{[^}]*\}\}/g, '');
  text = text.replace(/<ref[^>]*>.*?<\/ref>/gs, '');
  text = text.replace(/<ref[^>]*\/>/g, '');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2');
  text = text.replace(/\[\[([^\]]+)\]\]/g, '$1');
  text = text.replace(/\[https?:\/\/[^\s\]]+\s*([^\]]*)\]/g, '$1');
  text = text.replace(/'{2,5}/g, '');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

function extractFirstParagraph(text) {
  if (!text) return null;
  const lines = text.split('\n');
  let paragraph = lines[0].trim();
  for (let i = 1; i < lines.length; i++) {
    const next = lines[i].trim();
    if (!next || /^[=#*:;|]/.test(next)) break;
    paragraph += ' ' + next;
  }
  return paragraph.replace(/\s+/g, ' ').trim() || null;
}

function prevWord(paragraph, i) {
  let start = i;
  while (start > 0 && paragraph[start - 1] !== ' ') start--;
  return paragraph.slice(start, i).toLowerCase();
}

function nextNonSpaceChar(paragraph, i) {
  while (i < paragraph.length && paragraph[i] === ' ') i++;
  return paragraph[i];
}

function extractFirstSentence(paragraph) {
  for (let i = 0; i < paragraph.length; i++) {
    const c = paragraph[i];
    if (c !== '.' && c !== '!' && c !== '?') continue;

    if (paragraph[i + 1] && paragraph[i + 1] !== ' ') continue;

    const nextChar = nextNonSpaceChar(paragraph, i + 2);
    if (nextChar && !/[A-Z"(\[]/.test(nextChar)) continue;

    if (ABBREV.has(prevWord(paragraph, i))) continue;

    return paragraph.slice(0, i + 1).trim();
  }
  return null;
}

function parseFirstSentence(wikitext) {
  if (!wikitext) return null;
  const stripped = extractPlainText(wikitext);
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