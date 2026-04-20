const {fetchYearEndSnapshots, getOutgoingLinks} = require('./wikiapi.js');
const {connectToCluster, getArg, getPrivateIp} = require('../lib/clusterConnect.js');
const {storeYearEndState} = require('../storage/wikiStore.js');
const util = require('util');

const ORCHESTRATOR_SERVICE_NAME = 'orchestrator';
const GID = 'wiki5';
const YEARS = [
  2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009,
  2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019,
  2020, 2021, 2022, 2023, 2024, 2025, 2026,
];

const ip = getArg('--ip', getPrivateIp());
const port = Number(getArg('--port', '8080'));
const orchestratorIp = getArg('--orchip', '172.31.33.54');
const orchestratorPort = Number(getArg('--orchport', '9000'));
const nodesFile = getArg('--nodes-file', 'nodes.txt');
const COORD = {ip: orchestratorIp, port: orchestratorPort};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runWorker(dist) {
  const send = util.promisify(dist.local.comm.send.bind(dist.local.comm));
  const store = util.promisify(storeYearEndState);
  const myNid = dist.util.id.getNID(dist.node.config);

  console.log(`[worker] ${ip}:${port} polling coord ${COORD.ip}:${COORD.port}`);

  while (true) {
    let title;
    try {
      title = await send(
          [myNid],
          {node: COORD, service: ORCHESTRATOR_SERVICE_NAME, method: 'get_job'},
      );
    } catch (err) {
      console.log(`[worker] get_job RPC failed: ${err.message}; retrying in 10s`);
      await sleep(10000);
      continue;
    }

    if (title === null) {
      console.log('[worker] coord reports job complete; staying up for MR');
      await sleep(30000);
      continue;
    }
    if (title === '__WAIT__') {
      await sleep(5000);
      continue;
    }

    const t0 = Date.now();
    let result;
    try {
      const snapshots = fetchYearEndSnapshots(title, YEARS, {});
      await store(GID, title, snapshots);
      const links = getOutgoingLinks(title);
      const elapsedMs = Date.now() - t0;
      result = {pageId: snapshots.pageId, links, elapsedMs};
      console.log(`[worker] stored ${title} (pageId=${snapshots.pageId}, links=${links.length}, ${elapsedMs}ms)`);
    } catch (err) {
      result = {error: err.message || String(err), elapsedMs: Date.now() - t0};
      console.log(`[worker] failed ${title}: ${err.message}`);
    }

    try {
      await send(
          [title, result],
          {node: COORD, service: ORCHESTRATOR_SERVICE_NAME, method: 'notify'},
      );
    } catch (err) {
      console.log(`[worker] notify RPC failed for ${title}: ${err.message};`);
    }
  }
}

(async () => {
  const dist = await connectToCluster({ip, port, gid: GID, nodesFile});
  await runWorker(dist);
  process.exit(0);
})().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
