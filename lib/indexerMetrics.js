function createMetrics(label) {
  const start = Date.now();
  const phases = Object.create(null);

  function phase(name) {
    const t0 = Date.now();
    return () => {
      phases[name] = Date.now() - t0;
    };
  }

  function rate(count, ms) {
    if (!ms || ms <= 0) return '-';
    return Math.round((count * 1000) / ms).toLocaleString() + '/s';
  }

  function report(counts) {
    const totalMs = Date.now() - start;
    const phaseParts = Object.entries(phases)
        .map(([n, ms]) => `${n}=${(ms / 1000).toFixed(2)}s`)
        .join(' ');

    const countParts = Object.entries(counts || {})
        .map(([k, v]) => `${k}=${Number(v).toLocaleString()}`)
        .join(' ');

    const lines = [
      `[${label}] ========== TIMING ==========`,
      `[${label}] total:        ${(totalMs / 1000).toFixed(2)}s`,
      `[${label}] phases:       ${phaseParts}`,
      `[${label}] counts:       ${countParts}`,
    ];

    if (counts && typeof counts.input === 'number' && phases.list != null) {
      lines.push(`[${label}] list rate:    ${rate(counts.input, phases.list)}`);
    }
    if (counts && typeof counts.results === 'number' && phases.mapreduce != null) {
      lines.push(`[${label}] mr rate:      ${rate(counts.results, phases.mapreduce)} results/s over MR`);
    }
    if (counts && typeof counts.written === 'number' && phases.write != null) {
      lines.push(`[${label}] write rate:   ${rate(counts.written, phases.write)}`);
    }
    lines.push(`[${label}] ============================`);

    for (const line of lines) console.log(line);
  }

  return {phase, report};
}

module.exports = {createMetrics};
