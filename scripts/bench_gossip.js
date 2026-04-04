#!/usr/bin/env node
require('../distribution.js')();
require('../test/helpers/sync-guard');

const distribution = globalThis.distribution;
const id = distribution.util.id;

const n1 = {ip: '127.0.0.1', port: 8000};
const n2 = {ip: '127.0.0.1', port: 8001};
const n3 = {ip: '127.0.0.1', port: 8002};
const n4 = {ip: '127.0.0.1', port: 8003};
const n5 = {ip: '127.0.0.1', port: 8004};
const n6 = {ip: '127.0.0.1', port: 8005};

const nodes = [n1, n2, n3, n4, n5, n6];

const TRIALS = parseInt(process.argv[2] || '30', 10);
const TIMEOUT_MS = parseInt(process.argv[3] || '100', 10);
const POLL_MS = 25;

const nowMs = () => Number(process.hrtime.bigint()) / 1e6;

function stopAll(cb) {
    const remote = {service: 'status', method: 'stop'};
    let i = 0;
    (function step() {
        if (i === nodes.length) return cb();
        remote.node = nodes[i++];
        distribution.local.comm.send([], remote, () => step());
    })();
}

function spawnAll(cb) {
    distribution.node.start((e) => {
        if (e) return cb(e);
        let i = 0;
        (function step() {
            if (i === nodes.length){
                return cb();
            }
            distribution.local.status.spawn(nodes[i++], (e2) => e2 ? cb(e2) : step());
        })();
    });
}

function pctl(arr, q) {
    const a = arr.slice().sort((x, y) => x - y);
    return a[Math.floor(q * (a.length - 1))] || 0;
}

function instMygroup(groupNodes, subsetFn, cb) {
    const mygroupGroup = {};
    groupNodes.forEach((n) => (mygroupGroup[id.getSID(n)] = n));

    const cfg = {gid: 'mygroup', subset: subsetFn};

    distribution.local.groups.put(cfg, mygroupGroup, (e) => {
        if (e){
            return cb(e);
        }
        distribution.mygroup.groups.put(cfg, mygroupGroup, (e2) => {
            if (e2 && Object.keys(e2).length > 0){
                return cb(e2);
            }
            cb(null, mygroupGroup);
        });
    });
}

function convergedCount(groupName, cb) {
    distribution.mygroup.groups.get(groupName, (e, v) => {
        if (e && Object.keys(e).length > 0){
            return cb(e, 0);
        }
        let count = 0;
        for (const sid in v) {
            if (v[sid] && Object.keys(v[sid]).length > 0){
                count++;
            }
        }
        cb(null, count);
    });
}

function runTrials(expected, subsetLabel, cb) {
    const times = [];
    let ok = 0;
    let t = 0;

    (function one() {
        if (t === TRIALS) {
        const mean = times.reduce((a, x) => a + x, 0) / (times.length || 1);
        console.log(`${subsetLabel}  success=${ok}/${TRIALS}  mean_ms=${mean.toFixed(1)}  p95_ms=${pctl(times, 0.95).toFixed(1)}`);
        return cb();
        }

        const gname = `newgroup_${Date.now()}_${t}`;
        distribution.mygroup.groups.put(gname, {}, (e) => {
        if (e && Object.keys(e).length > 0) return cb(e);

        const newNode = {ip: '127.0.0.1', port: 4444 + t};
        const msg = [gname, newNode];
        const remote = {service: 'groups', method: 'add'};

        const start = nowMs();
        distribution.mygroup.gossip.send(msg, remote, () => {
            const deadline = start + TIMEOUT_MS;

            (function poll() {
            convergedCount(gname, (pe, c) => {
                if (pe) return cb(pe);

                if (c >= expected) {
                ok++;
                times.push(nowMs() - start);
                t++;
                return one();
                }
                if (nowMs() >= deadline) {
                t++;
                return one();
                }
                setTimeout(poll, POLL_MS);
            });
            })();
        });
        });
    })();
    }

    stopAll(() => {
    spawnAll((e) => {
        if (e) {
            console.error(e);
            process.exit(1);
        }

        const groupNodes = [n1, n2, n3, n4, n5, n6];
        const expected = groupNodes.length; 

        const configs = [
            {label: 'k=1', fn: (lst) => 1},
            {label: 'k=logn', fn: (lst) => Math.ceil(Math.log(lst.length + 1))},
            {label: 'k=all', fn: (lst) => lst.length},
        ];

        let i = 0;
        (function next() {
            if (i === configs.length) {
                stopAll(() => {
                if (globalThis.distribution.node.server) globalThis.distribution.node.server.close();
                });
                return;
            }

            const cfg = configs[i++];
            instMygroup(groupNodes, cfg.fn, (e2) => {
                if (e2) {
                    console.error(e2);
                    process.exit(1);
                }
                runTrials(expected, cfg.label, (e3) => {
                if (e3) {
                    console.error(e3);
                    process.exit(1);
                }
                next();
                });
            });
        })();
    });
});