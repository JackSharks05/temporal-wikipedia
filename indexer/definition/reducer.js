function reduceYearWord(key, data, ctx) {
  return {[`definition:${key}`]: Array.isArray(data) ? data[0] : data};
}

module.exports = {reduceYearWord};
