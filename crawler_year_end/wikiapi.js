// https://en.wikipedia.org/w/api.php?action=query&titles=Pluto&prop=revisions&rvlimit=1&rvprop=content|timestamp|ids&rvdir=older&rvstart=2010-08-25T00:00:00Z&format=json

const {api, revisionContent, normalizeDisplayTitle, fetchCurrentPageHtml, extractBodyArticleLinksFromHtml,} = require('../crawler/wikiFetch');
const {getArg} = require('../lib/clusterConnect');

function fetchYearEndSnapshots(title, years, opts) {
  if (!Array.isArray(years) || years.length === 0) {
    throw new Error('fetchYearEndSnapshots: years must be a non-empty array');
  }

  let resolvedTitle = normalizeDisplayTitle(title);
  let pageId = '';
  const out = {};
  const sortedYears = years.slice().sort((a, b) => a - b);

  for (const year of sortedYears) {
    const rvstart = `${year}-12-31T23:59:59Z`;
    const payload = api({
      action: 'query',
      prop: 'revisions',
      titles: resolvedTitle,
      redirects: '1',
      rvprop: 'ids|timestamp|content',
      rvslots: 'main',
      rvdir: 'older',
      rvstart,
      rvlimit: '1',
      format: 'json',
      formatversion: '2',
    }, opts);

    const page = payload.query && payload.query.pages && payload.query.pages[0];
    if (!page) {
      throw new Error(`fetchYearEndSnapshots: malformed response for "${title}" year ${year}`);
    }
    if (page.missing) {
      throw new Error(`fetchYearEndSnapshots: page "${title}" does not exist`);
    }

    if (!pageId && page.pageid) pageId = String(page.pageid);
    if (page.title) resolvedTitle = normalizeDisplayTitle(page.title);

    const rev = page.revisions && page.revisions[0];
    if (!rev) continue; 

    out[String(year)] = revisionContent(rev);
  }

  if (Object.keys(out).length === 0) {
    throw new Error(`fetchYearEndSnapshots: no revisions found for "${title}" in any of ${years.length} target years`);
  }

  return {pageId, title: resolvedTitle, years: out};
}

function getOutgoingLinks(title) {
    data = fetchCurrentPageHtml(title)
    return extractBodyArticleLinksFromHtml(data.html)
}

module.exports = {fetchYearEndSnapshots, getOutgoingLinks};


 if (require.main === module) {                                                     
    const r = fetchYearEndSnapshots('United States', [2010, 2020]);
    console.log('pageId:', r.pageId, 'title:', r.title);                             
    for (const [y, c] of Object.entries(r.years)) {                                  
      console.log(`  ${y}: ${c.length} chars`);                                      
    }                                                                                
  }   
