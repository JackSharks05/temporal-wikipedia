function concurrentEach(items, worker, callback) {
  if (!items.length) return callback(null, 0);

  let idx = 0;
  let completed = 0;
  let inFlight = 0;
  let done = false;

  function concWrite() {
    while (!done && inFlight < 100 && idx < items.length) {
      inFlight++;
      worker(items[idx++], (err) => {
        if (done) return;
        if (err) { done = true; return callback(err); }
        inFlight--;
        completed++;
        if (idx >= items.length && inFlight === 0) {
          done = true;
          return callback(null, completed);
        }
        concWrite();
      });
    }
  }
  concWrite();
}

module.exports = {concurrentEach};
