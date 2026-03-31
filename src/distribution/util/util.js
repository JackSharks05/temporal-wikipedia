// @ts-check
const serialization = require('./serialization.js');
const id = require('./id.js');
const wire = require('./wire.js');
const log = require('./log.js');

/* Helper function that fills in any missing arguments with undefined */
/**
 * @param {string | any[]} func
 * @param {string | any[]} args
 */
function normalize(func, args) {
  const normalizedArgs = [...args];
  // Last argument is the callback
  if (args.length < func.length - 1) {
    const diff = func.length - args.length - 1;
    for (let i = 0; i < diff; i++) {
      normalizedArgs.push(undefined);
    }
  }
  return normalizedArgs;
}

/**
 * 
 * @param {Array} arr
 * @param {number} count
 */
function chooseRandomSlice(arr, count) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

module.exports = {
  chooseRandomSlice: chooseRandomSlice,
  normalize: normalize,
  serialize: serialization.serialize,
  deserialize: serialization.deserialize,
  id: id,
  wire: wire,
  log: log,
};
