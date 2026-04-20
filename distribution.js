#!/usr/bin/env node
/* BEGIN COPIED FROM Jack S / stencil: stencil/distribution.js */
/**
 * @typedef {import("./distribution/types.js").Node} Node
 */

/**
 * @param {Node} [config]
 */
function bootstrap(config) {
  const distribution = {};
  globalThis.__workerRequire = require;
  globalThis.distribution = distribution;
  distribution.util = require('./distribution/util/util.js');

  distribution.node = require('./distribution/local/node.js');
  if (config) {
    distribution.node.config = config;
  }
  distribution.local = require('./distribution/local/local.js');

  const {setup} = require('./distribution/all/all.js');
  distribution.all = setup({gid: 'all'});

  for (const [key, service] of Object.entries(distribution.local)) {
    distribution.local.routes.put(service, key, () => {});
  }

  return distribution;
}
/* END COPIED FROM Jack S / stencil: stencil/distribution.js */

/* BEGIN NEW CODE WRITTEN FOR THE MERGED WORKSPACE */
const {debug} = require('./package.json'); // NEW: Keep only the debug flag from package.json.
const distribution = bootstrap; // NEW: Always use the merged local implementation.
globalThis.debug = debug ? true : false; // NEW: Preserve the original debug toggle behavior.

if (require.main === module) { // NEW: Preserve CLI startup for spawned worker nodes.
  globalThis.distribution = distribution(); // NEW: Initialize the merged distribution when invoked directly.
  globalThis.distribution.node.start(globalThis.distribution.node.config.onStart || (() => {})); // NEW: Start the node exactly as the stencil CLI did.
} // NEW: End direct-execution branch.

module.exports = distribution; // NEW: Export the merged bootstrap directly.
/* END NEW CODE WRITTEN FOR THE MERGED WORKSPACE */
