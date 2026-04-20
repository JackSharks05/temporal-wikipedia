const {spawnSync} = require('node:child_process');
const {
  revisionContent,
  normalizeDisplayTitle,
  fetchCurrentPageHtml,
  extractBodyArticleLinksFromHtml,
} = require('../crawler/wikiFetch');

const USER_AGENT = 'TemporalWikipediaCrawler/0.1 (Brown CSCI 1380 project)';

function fetchYearEndSnapshots(title, years) {
  let resolvedTitle = normalizeDisplayTitle(title);
  let pageId = '';
  const out = {};
  const sortedYears = years.slice().sort((a, b) => a - b);

  for (const year of sortedYears) {
    const params = new URLSearchParams({
      action: 'query',
      prop: 'revisions',
      titles: resolvedTitle,
      redirects: '1',
      rvprop: 'ids|timestamp|content',
      rvslots: 'main',
      rvdir: 'older',
      rvstart: `${year}-12-31T23:59:59Z`,
      rvlimit: '1',
      format: 'json',
      formatversion: '2',
    });

    const url = `https://en.wikipedia.org/w/api.php?${params}`;
    const res = spawnSync('curl', [
      '--silent', '--show-error', '--location', '--compressed',
      '--max-time', '20', '--user-agent', USER_AGENT, url,
    ], {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});

    const page = JSON.parse(res.stdout).query.pages[0];
    if (!pageId && page.pageid) pageId = String(page.pageid);
    if (page.title) resolvedTitle = normalizeDisplayTitle(page.title);

    const rev = page.revisions && page.revisions[0];
    if (!rev) continue;
    out[String(year)] = revisionContent(rev);
  }

  return {pageId, title: resolvedTitle, years: out};
}

function getOutgoingLinks(title) {
  const data = fetchCurrentPageHtml(title);
  return extractBodyArticleLinksFromHtml(data.html, {currentTitle: data.title});
}

module.exports = {fetchYearEndSnapshots, getOutgoingLinks};

if (require.main === module) {
  const r = fetchYearEndSnapshots('United States', [2010, 2020]);
  console.log('pageId:', r.pageId, 'title:', r.title);
  for (const [y, c] of Object.entries(r.years)) {
    console.log(`  ${y}: ${c.length} chars`);
  }
}
