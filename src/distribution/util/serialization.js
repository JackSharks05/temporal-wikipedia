// @ts-check

/**
 * @param {any} object
 * @returns {string}
 */
function serialize(object) {
  return JSON.stringify(s(object));
}

function s(object) {
  const type = getType(object);
  const result = {};
  result['type'] = type;
  let value;
  if (type == 'object' || type == 'array') {
    value = {};
    for (const key of Object.keys(object)) {
      value[key] = s(object[key]);
    }
  } else if (type == 'function') {
    value = object.toString();
  } else if (type == 'date') {
    value = object.toISOString();
  } else if (type == 'error') {
    value = serializeError(object);
  } else if (type == 'undefined' || type == 'null') {
    value = '';
  } else if (type == 'number') {
    value = serializeNumber(object);
  } else {
    value = String(object);
  }
  result['value'] = value;
  return result;
}

function serializeNumber(object) {
  if (Number.isNaN(object)) return 'NaN';
  if (object === Infinity) return 'Infinity';
  if (object === -Infinity) return '-Infinity';
  return object;
}

function serializeError(error) {
  const res = {};
  res['name'] = error.name;
  res['message'] = error.message;
  res['cause'] = s(error.cause);
  return res;
}

function getType(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'function') return 'function';
  if (value instanceof Date) return 'date';
  if (value instanceof Error) return 'error';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return typeof value;
}

function deserialize(string) {
  if (typeof string !== 'string') {
    throw new Error(`Invalid argument type: ${typeof string}.`);
  }
  const json = JSON.parse(string);
  return ds(json);
}

function ds(obj) {
  const type = obj['type'];
  const value = obj['value'];
  if (type == 'object') {
    const result = {};
    for (const key in value) {
      result[key] = ds(value[key]);
    }
    return result;
  }
  if (type == 'array') {
    const result = [];
    for (const key of Object.keys(value)) {
      result.push(ds(value[key]));
    }
    return result;
  }
  if (type == 'function') {
    return eval(`(${value})`);
  }
  if (type == 'date') {
    return new Date(value);
  }
  if (type == 'error') {
    return deserializeError(value);
  }
  if (type == 'number') {
    return deserializeNumber(value);
  }
  if (type == 'boolean') {
    return value === 'true';
  }
  if (type == 'string') {
    return value;
  }
  if (type == 'null') {
    return null;
  }
  if (type == 'undefined') {
    return undefined;
  }
  throw new Error('not a type');
}

function deserializeNumber(value) {
  if (value === 'NaN') return NaN;
  if (value === 'Infinity') return Infinity;
  if (value === '-Infinity') return -Infinity;
  return Number(value);
}

function deserializeError(value) {
  const err = new Error(value['message']);
  err.name = value['name'];
  if (value['cause'] !== undefined) {
    err.cause = ds(value['cause']);
  }
  return err;
}

module.exports = {
  serialize,
  deserialize,
};
