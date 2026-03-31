// @ts-check

const local = require('../local/local.js');

const activeBeacons = {};
/**
 * @param {string} gid
 */
function startBeacon(gid) {
  let lastGroup = null;
  if (activeBeacons[gid]) return;

  local.groups.get(gid, (e, group) => {
    if (!e && group) lastGroup = {...group};
  });

  globalThis.distribution[gid].gossip.at(1000, () => {
    local.groups.get(gid, (e, curGroup) => {
      if (e) return;
      if (lastGroup != null && Object.keys(curGroup).length !== Object.keys(lastGroup).length) {
        const oldGroup = {...lastGroup};
        lastGroup = {...curGroup};
        globalThis.distribution[gid].mem.reconf(oldGroup, (e, v) => {
          globalThis.distribution[gid].store.reconf(oldGroup, (e, v) => {
          });
        });
      } else {
        lastGroup = {...curGroup};
      }
    });
  }, (e, intervalID) => {});
}

module.exports = {startBeacon};
