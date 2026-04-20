the old README.md in this folder is for the old dump crawler and crawler.js

the new crawler files are

distributedCrawler.js
wikiFetch.js
-----------
idea:
1. start from a seed wikipedia page
2. fetch the current html for that page
3. pull links out of the article body
4. fetch revision history for that same page
5. store the page in the wiki store using the segmented delta encoding stuff
6. add new links to the crawl frontier
7. keep going until article cap or rounds run out


html is used for finding links in the article body
the wikipedia api is used for getting revision history
------------

the crawl state is stored in the crawl gid
map reduce runs over pending crawl pages

map:
fetch page
find links
save raw article info on the crawl record
emit new linked pages

reduce:
dedupe the linked pages and create new pending crawl records

after that the crawler stores the fetched article into the wiki gid
---------
important defaults right now:

seed article is distributed systems
default history limit is 2000


The title lookup key (article-title:<title>) is stored separately and just maps a page title to its page id.

I changed store.js so that all of the real history data for one page (article-meta, article-manifest, and every article-segment) 
hashes using the same pageId, which forces that article’s segments to stay on one node instead of getting split across different nodes.