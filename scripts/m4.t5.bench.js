const crypto = require('node:crypto');
const dist = require('../distribution.js')();

const N = Number(process.env.N || 1000);
const svcName = (process.argv[2] === 'mem') ? 'mem' : 'store';
const nodeArgs = process.argv.slice(3);

if (nodeArgs.length === 0) {
  console.log('Usage: N=1000 node scripts/m4.t5.bench.js <mem|store> ip:port ip:port ip:port');
  process.exit(1);
}

function parseNode(s) {
  const parts = s.split(':');
  return {ip: parts[0], port: Number(parts[1])};
}

const nodes = nodeArgs.map(parseNode);

dist.node.config = nodes[0];

const group = {};
for (let i = 0; i < nodes.length; i++) {
  const sid = dist.util.id.getSID(nodes[i]);
  group[sid] = nodes[i];
}

dist.local.groups.put('all',group,function() {
  const pairs = [];
  for (let i = 0; i < N; i++) {
    const key = crypto.randomBytes(12).toString('hex');
    const val = {i: i,s: crypto.randomBytes(16).toString('hex')};
    pairs.push({key: key,val: val});
  }

  const svc = dist.all[svcName];

  function bench(label,op,done) {
    let i = 0;
    const t0 = Date.now();

    function next() {
      if (i === N) {
        const ms = Date.now() - t0;
        const avg = ms/N;
        const thr = N/(ms/1000);
        console.log(svcName + '.'+label+': avg='+avg+'ms'+' thr='+thr+' ops/s');
        return done();
      }

      op(i,function() { 
        i++;
        next();
      });
    }

    next();
  }

  bench('PUT',(i,cb) =>{
    svc.put(pairs[i].val,pairs[i].key,cb);
  }, () => {
    bench('GET',function(i,cb) {
      svc.get(pairs[i].key,cb);
    }, () => {});
  });
});