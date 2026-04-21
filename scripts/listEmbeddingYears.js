const { connectToCluster, shutdown } = require("../lib/clusterConnect");
const { normalizeError } = require("../lib/normalizeError");

async function main() {
  let dist;
  try {
    const port = Number(process.env.CLUSTER_PORT || 18080);
    dist = await connectToCluster({
      gid: "wiki",
      nodesFile: "nodes.txt",
      port,
      propagate: false,
    });
    const store = globalThis.distribution["wiki"].store;
    store.get({ key: null, gid: "wiki" }, async (err, keys) => {
      const normalized = normalizeError(err);

      const kArr = Array.isArray(keys) ? keys : Object.keys(keys || {});
      if (normalized && kArr.length === 0) {
        console.error("ERR=" + normalized.message);
        await shutdown(dist);
        process.exit(1);
        return;
      }
      if (normalized) {
        console.error("WARN_PARTIAL=" + normalized.message);
      }

      const ys = new Set();
      kArr.forEach((k) => {
        if (typeof k === "string") {
          const m = k.match(/^embedding:(\d+):/);
          if (m) ys.add(Number(m[1]));
        }
      });
      const years = [...ys].sort((a, b) => a - b);
      console.log("YEARS=" + years.join(" "));
      console.log("YEARS_COUNT=" + years.length);
      await shutdown(dist);
      process.exit(0);
    });
  } catch (e) {
    console.error("ERR=" + e.message);
    if (dist) {
      try {
        await shutdown(dist);
      } catch (_) {
        // best effort cleanup
      }
    }
    process.exit(1);
  }
}
main();
