require('../distribution.js')();
const distribution = globalThis.distribution;
const id = distribution.util.id;

const n1 = {ip: '127.0.0.1', port: 7310};
const n2 = {ip: '127.0.0.1', port: 7311};
const n3 = {ip: '127.0.0.1', port: 7312};

const group = {};
group[id.getSID(n1)] = n1;
group[id.getSID(n2)] = n2;
group[id.getSID(n3)] = n3;

const mapper = (key, value) => {
  const [, year, , temp] = value.split(/(\s+)/).filter((e) => e !== ' ');
  const out = {};
  out[year] = parseInt(temp, 10);
  return [out];
};

const reducer = (key, values) => {
  const out = {};
  out[key] = values.reduce((a, b) => Math.max(a, b), -Infinity);
  return out;
};

function makeDataset(n) {
  const dataset = [];
  for (let i = 0; i < n; i++) {
    const key = 'k' + i;
    const year = String(1940 + (i % 10));
    const temp = String(((i * 17) % 140) - 20).padStart(5, i % 2 === 0 ? '+' : '-');
    const value = '006701199099999 ' + year + ' 0515070049999999N9 ' + temp + ' 1+9999';
    const obj = {};
    obj[key] = value;
    dataset.push(obj);
  }
  return dataset;
}

const dataset = makeDataset(2000);
const gid = 'm5bench';

function getDatasetKeys(ds) {
  return ds.map((o) => Object.keys(o)[0]);
}

function mean(xs) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function runOnce(cb) {
  const start = Date.now();
  distribution[gid].mr.exec(
      {keys: getDatasetKeys(dataset), map: mapper, reduce: reducer},
      (e, v) => {
        if (e) {
          return cb(e);
        }
        const seconds = (Date.now() - start) / 1000;
        return cb(null, seconds);
      },
  );
}

function runMany(warmups, trials, cb) {
  const times = [];
  let i = 0;

  const next = () => {
    if (i === warmups + trials) {
      return cb(null, times);
    }

    runOnce((e, seconds) => {
      if (e) {
        return cb(e);
      }
      if (i >= warmups) {
        times.push(seconds);
      }
      i++;
      next();
    });
  };

  next();
}

function loadDataset(cb) {
  let count = 0;
  dataset.forEach((o) => {
    const key = Object.keys(o)[0];
    const value = o[key];
    distribution[gid].store.put(value, key, (e) => {
      if (e) {
        return cb(e);
      }
      count++;
      if (count === dataset.length) {
        cb(null);
      }
    });
  });
}

function stopAll() {
  const remote = {service: 'status', method: 'stop'};
  remote.node = n1;
  distribution.local.comm.send([], remote, () => {
    remote.node = n2;
    distribution.local.comm.send([], remote, () => {
      remote.node = n3;
      distribution.local.comm.send([], remote, () => {
        if (distribution.node.server) {
          distribution.node.server.close();
        }
      });
    });
  });
}

distribution.node.start(() => {
  distribution.local.status.spawn(n1, () => {
    distribution.local.status.spawn(n2, () => {
      distribution.local.status.spawn(n3, () => {
        const cfg = {gid: gid};

        distribution.local.groups.put(cfg, group, () => {
          distribution[gid].groups.put(cfg, group, () => {
            loadDataset((e) => {
              if (e) {
                console.error(e);
                return stopAll();
              }

              runMany(2, 5, (e2, times) => {
                if (e2) {
                  console.error(e2);
                  return stopAll();
                }

                const jobLatency = mean(times);
                const latencyPerRecord = jobLatency / dataset.length;
                const throughput = dataset.length / jobLatency;

                console.log('dataset size:', dataset.length);
                console.log('times (s):', times);
                console.log('avg latency (s/record):', latencyPerRecord);
                console.log('throughput (records/s):', throughput);

                stopAll();
              });
            });
          });
        });
      });
    });
  });
});