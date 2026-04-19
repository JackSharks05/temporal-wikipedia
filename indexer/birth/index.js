const util = require('util');
const {normalizeError: normalizeStoreError} = require('../../lib/normalizeError');


const MAPPER_MODULE = require.resolve('./mapper');
const REDUCER_MODULE = require.resolve('./reducer');

const get = promsify(service.store.get);

function buildDistributedIndex(gid, callback, options) {
    const YEARS = [
        2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009,
        2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019,
        2020, 2021, 2022, 2023, 2024, 2025, 2026
    ];

    const service = globalThis.distribution && globalThis.distribution[gid];
    if (!service || !service.store) {
        return callback(new Error(`group not found: ${gid}`));
    }
    try {
        const keys = await get({key: null, gid})
    } catch (error){
        callback(error);
    }

    service.mr.exec({
      keyPrefix: 'diff:',
      mapModule: MAPPER_MODULE,
      mapExport: 'mapArticle',
      mapContext: {gid},
      reduceModule: REDUCER_MODULE,
      reduceExport: 'reduceYear',
      reduceContext: {},
    }, (mrErr, results) => {
        if (mrErr) {
            return callback(normalizeStoreError(mrErr));
        }

        if (!results || results.length === 0) {
            console.log('[indexer] MapReduce produced no results');
            return callback(null, 0);
        }

        console.log(`[indexer] MapReduce done, writing ${results.length} index entries...`);
        let i = 0;
        let written = 0;

        function nextWrite() {
            if (i >= results.length) {
                console.log(`[indexer] stored ${written} birth/death entries`);
                return callback(null, written)
            }
            const entry = results[i];
            const keys = Object.keys(entry);
            for (const yearRank of keys.entries()) {
                service.store.put(entry[yearRank], {key: yearRank}, (e, v) => {
                    if (e) {
                        return callback(normalizeStoreError(e));
                    }
                    i+=1;
                    written+=1;
                    if (written % 500 === 0) console.log(`[indexer]   wrote ${written}...`);
                    nextWrite();
                });
            }
        }
    });
}



if (require.main === module) {
  const {connectToCluster, shutdown, getArg, hasArg} = require('../../lib/clusterConnect');

  const gid = getArg('--gid', 'wiki');

  (async () => {
    let dist;
    try {
      dist = await connectToCluster({
        nodesFile: getArg('--nodes-file', null),
        gid,
        port: parseInt(getArg('--port', '8081'), 10),
        ip: getArg('--ip', null),
        propagate: true,
      });
    } catch (err) {
      console.error('Failed to connect:', err.message);
      process.exit(1);
    }

    console.log(`[indexer] group: ${gid}`);

    buildDistributedIndex(gid, {deaths}, async (err, count) => {
      if (err) {
        console.error('[indexer] Error:', err.message);
        await shutdown(dist);
        process.exit(1);
      }
      console.log(`[indexer] done. ${count} definition entries built.`);
      await shutdown(dist);
      process.exit(0);
    });
  })();
}