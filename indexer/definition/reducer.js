function reduceYearWord(key, data, ctx) {
  return {[key]: Array.isArray(data) ? data[0] : data};
}

module.exports = {reduceYearWord};
