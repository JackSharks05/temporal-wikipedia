const fs = require('fs');
const {connectToCluster, getArg, getPrivateIp, hasArg} = require('../lib/clusterConnect');
const {normalizeTitle} = require('../storage/segmentArticle');

const DEFAULT_MAX_PAGES = 1000;
const DEFAULT_MAX_QUEUE_SIZE = 1_000_000;
const DEFAULT_CHECKPOINT_INTERVAL_MS = 30_000;
const DEFAULT_SAVE_PATH = 'crawl_save.json';

class Orchestrator {
  constructor(seeds, options = {}) {
    this.maxPages = options.maxPages || DEFAULT_MAX_PAGES;
    this.maxQueueSize = options.maxQueueSize || DEFAULT_MAX_QUEUE_SIZE;
    this.savePath = options.savePath || DEFAULT_SAVE_PATH;

    this.queue = [];
    this.queuedSet = new Set();
    this.visited = new Set();
    this.failed = new Set();

    const restored = options.fresh ? false : this.restore();
    if (!restored) {
      for (const seed of seeds) this.enqueue(seed);
      console.log(`[orch] seeded with ${seeds.length} titles, queue=${this.queue.length}`);
    }
  }

  enqueue(title) {
    if (!title) return;
    const k = normalizeTitle(title);
    if (!k) return;
    if (this.visited.has(k) || this.failed.has(k) || this.queuedSet.has(k)) return;
    if (this.queue.length >= this.maxQueueSize) return;
    this.queue.push(title);
    this.queuedSet.add(k);
  }

  getJob() {
    if (this.visited.size >= this.maxPages) return null;

    while (this.queue.length > 0) {
      const title = this.queue.shift();
      const k = normalizeTitle(title);
      this.queuedSet.delete(k);
      if (this.visited.has(k) || this.failed.has(k)) continue;
      this.visited.add(k);
      return title;
    }
    return '__WAIT__';
  }

  notify(title, result) {
    if (!title) return;
    const k = normalizeTitle(title);

    if (result && result.error) {
      this.failed.add(k);
      return;
    }

    this.visited.add(k);
    if (result && Array.isArray(result.links)) {
      for (const link of result.links) this.enqueue(link);
    }
  }

  status() {
    return {
      visited: this.visited.size,
      queued: this.queue.length,
      failed: this.failed.size,
      cap: this.maxPages,
    };
  }

  isDone() {
    return this.visited.size >= this.maxPages;
  }

  checkpoint() {
    const state = {
      queue: this.queue,
      visited: [...this.visited],
      failed: [...this.failed],
      timestamp: new Date().toISOString(),
    };
    const tmp = this.savePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, this.savePath);
    const s = this.status();
    console.log(`[orch] checkpoint: ${s.visited}/${s.cap} visited, ${s.queued} queued, ${s.failed} failed`);
  }

  restore() {
    if (!fs.existsSync(this.savePath)) return false;
    try {
      const state = JSON.parse(fs.readFileSync(this.savePath, 'utf8'));
      this.queue = state.queue || [];
      this.visited = new Set(state.visited || []);
      this.failed = new Set(state.failed || []);
      this.queuedSet = new Set(this.queue.map((t) => normalizeTitle(t)).filter(Boolean));
      console.log(`[orch] restored from ${this.savePath}: ${this.visited.size} visited, ${this.queue.length} queued, ${this.failed.size} failed`);
      return true;
    } catch (err) {
      console.error(`[orch] restore failed (${err.message}); starting fresh`);
      return false;
    }
  }
}

module.exports = {Orchestrator};

if (require.main === module) {
  (async () => {
    const ip = getArg('--ip', getPrivateIp());
    const port = Number(getArg('--port', '9000'));
    const nodesFile = getArg('--nodes-file', null);
    const gid = getArg('--gid', 'wiki');
    const maxPages = Number(getArg('--max-pages', String(DEFAULT_MAX_PAGES)));
    const seedFile = getArg('--seeds', null);
    const savePath = getArg('--save', DEFAULT_SAVE_PATH);
    const fresh = hasArg('--fresh');
    const checkpointMs = Number(getArg('--checkpoint-ms', String(DEFAULT_CHECKPOINT_INTERVAL_MS)));

    if (!seedFile) {
      console.error('Usage: node crawler_year_end/orchestrator.js --seeds <file> --nodes-file <nodes.txt> [options]');
      process.exit(1);
    }

    const seeds = fs.readFileSync(seedFile, 'utf8')
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith('#'));

    const dist = await connectToCluster({ip, port, gid, nodesFile});

    const orch = new Orchestrator(seeds, {maxPages, savePath, fresh});
    console.log('[orch] initial state:', orch.status());

    const service = {
      get_job(nid, callback) {
        try {
          callback(null, orch.getJob());
        } catch (err) {
          callback(err);
        }
      },
      notify(title, result, callback) {
        try {
          orch.notify(title, result);
          callback(null, {ok: true});
        } catch (err) {
          callback(err);
        }
      },
      status(callback) {
        callback(null, orch.status());
      },
    };

    await new Promise((res, rej) => dist.local.routes.put(service, 'orchestrator', (err) => err ? rej(err) : res()));
    console.log(`[orch] listening on ${ip}:${port} (service=orchestrator)`);

    let shuttingDown = false;
    const tick = setInterval(() => {
      if (shuttingDown) return;
      orch.checkpoint();
      if (orch.isDone()) {
        console.log('[orch] crawl complete:', orch.status());
        shuttingDown = true;
        clearInterval(tick);
        setTimeout(() => {
          orch.checkpoint();
          process.exit(0);
        }, 30_000);
      }
    }, checkpointMs);

    const onSig = () => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log('\n[orch] signal received — checkpointing and exiting');
      try { orch.checkpoint(); } catch (e) { console.error('[orch] checkpoint failed:', e.message); }
      process.exit(0);
    };
    process.on('SIGINT', onSig);
    process.on('SIGTERM', onSig);
  })().catch((err) => {
    console.error('[orch] fatal:', err);
    process.exit(1);
  });
}
