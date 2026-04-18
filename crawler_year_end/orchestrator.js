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
    this.maxRecent = options.maxRecent || 100;

    this.queue = [];
    this.queuedSet = new Set();
    this.visited = new Set();
    this.failed = new Set();

    // Perf tracking
    this.startedAt = Date.now();
    this.completedCount = 0;      // successful notifies since start (not dispatches)
    this.recentCompletions = [];  // ring of {at, elapsedMs} for rolling stats

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

  getJob(nid) {
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

    // Perf: track actual completions (not dispatches). Worker reports elapsedMs;
    // we timestamp arrival for throughput window.
    this.completedCount += 1;
    const elapsedMs = (result && typeof result.elapsedMs === 'number') ? result.elapsedMs : null;
    this.recentCompletions.push({at: Date.now(), elapsedMs});
    if (this.recentCompletions.length > this.maxRecent) this.recentCompletions.shift();

    if (result && Array.isArray(result.links)) {
      for (const link of result.links) this.enqueue(link);
    }
  }

  perfSnapshot() {
    const uptimeMs = Date.now() - this.startedAt;
    const overallRate = uptimeMs > 0 ? this.completedCount / (uptimeMs / 1000) : 0;

    let recentRate = 0;
    let avgLatencyMs = 0;
    let latencySampleSize = 0;
    if (this.recentCompletions.length >= 2) {
      const oldest = this.recentCompletions[0].at;
      const newest = this.recentCompletions[this.recentCompletions.length - 1].at;
      const spanMs = newest - oldest;
      if (spanMs > 0) {
        recentRate = (this.recentCompletions.length - 1) / (spanMs / 1000);
      }
    }
    const withLatency = this.recentCompletions.filter((r) => r.elapsedMs != null);
    latencySampleSize = withLatency.length;
    if (latencySampleSize > 0) {
      avgLatencyMs = withLatency.reduce((s, r) => s + r.elapsedMs, 0) / latencySampleSize;
    }

    // ETA: remaining articles / current rate (completion-based)
    const remaining = Math.max(0, this.maxPages - this.completedCount);
    const rateForEta = recentRate > 0 ? recentRate : overallRate;
    const etaSec = rateForEta > 0 ? Math.round(remaining / rateForEta) : null;

    return {
      uptimeSec: Math.round(uptimeMs / 1000),
      completed: this.completedCount,
      overallRatePerSec: Number(overallRate.toFixed(2)),
      recentRatePerSec: Number(recentRate.toFixed(2)),
      avgLatencyMs: Math.round(avgLatencyMs),
      latencySampleSize,
      etaSec,
    };
  }

  status() {
    return {
      visited: this.visited.size,
      queued: this.queue.length,
      failed: this.failed.size,
      cap: this.maxPages,
      ...this.perfSnapshot(),
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
    fs.renameSync(tmp, this.savePath); // atomic
    const s = this.status();
    const etaStr = s.etaSec != null ? `eta ~${Math.round(s.etaSec / 60)}m` : 'eta n/a';
    console.log(
        `[orch] checkpoint: ${s.completed}/${s.cap} completed (${s.visited} dispatched, ${s.queued} queued, ${s.failed} failed) | ` +
        `throughput ${s.recentRatePerSec}/s recent (${s.overallRatePerSec}/s overall) | ` +
        `latency ${s.avgLatencyMs}ms avg over ${s.latencySampleSize} samples | ` +
        `uptime ${s.uptimeSec}s | ${etaStr}`,
    );
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

// === CLI entry ===

if (require.main === module) {
  (async () => {
    const ip = getArg('--ip', getPrivateIp());
    const port = Number(getArg('--port', '8080'));
    const nodesFile = getArg('--nodes-file', null);
    const gid = getArg('--gid', 'wiki');
    const maxPages = Number(getArg('--max-pages', String(DEFAULT_MAX_PAGES)));
    const seedFile = getArg('--seeds', null);
    const savePath = getArg('--save', DEFAULT_SAVE_PATH);
    const fresh = hasArg('--fresh');
    const checkpointMs = Number(getArg('--checkpoint-ms', String(DEFAULT_CHECKPOINT_INTERVAL_MS)));

    if (!seedFile) {
      console.error('Usage: node crawler_year_end/orchestrator.js --seeds <file> --nodes-file <nodes.txt> [options]');
      console.error('');
      console.error('  --seeds FILE        path to newline-separated seed titles');
      console.error('  --nodes-file FILE   cluster nodes file (required)');
      console.error('  --ip IP             coord bind ip (default: private ip)');
      console.error('  --port PORT         coord bind port (default: 9000)');
      console.error('  --gid GID           wiki gid (default: wiki)');
      console.error('  --max-pages N       stop after N articles stored (default: 1000)');
      console.error('  --save FILE         checkpoint path (default: crawl_save.json)');
      console.error('  --checkpoint-ms N   checkpoint interval ms (default: 30000)');
      console.error('  --fresh             ignore existing checkpoint, restart');
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
          callback(null, orch.getJob(nid));
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
