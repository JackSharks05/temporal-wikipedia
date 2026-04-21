function concurrentEach(items, worker, done, opts = {}) {
  const list = Array.isArray(items) ? items : [];
  const limit = Math.max(1, Number(opts.limit) || 32);

  if (list.length === 0) {
    done(null, 0);
    return;
  }

  let index = 0;
  let active = 0;
  let completed = 0;
  let failed = false;

  function launchNext() {
    if (failed) return;

    while (active < limit && index < list.length) {
      const item = list[index++];
      active += 1;

      worker(item, (err) => {
        if (failed) return;

        active -= 1;

        if (err) {
          failed = true;
          done(err, completed);
          return;
        }

        completed += 1;

        if (completed === list.length) {
          done(null, completed);
          return;
        }

        launchNext();
      });
    }
  }

  launchNext();
}

module.exports = { concurrentEach };
