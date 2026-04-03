// @ts-check

/**
 * @param {any} object
 * @returns {string}
 */
function serialize(object) {
  if (object === null) {
    return JSON.stringify({type: 'null', value: 'null'});
  }
  if (object === undefined) {
    return JSON.stringify({type: 'undefined', value: 'undefined'});
  }
  if (typeof object === 'number') {
    if (Number.isNaN(object)) {
      return JSON.stringify({type:'number', value: 'NaN'});

    }
    if (object === Infinity) {
      return JSON.stringify({type: 'number', value: 'Infinity'});

    }
    if (object === -Infinity) {
      return JSON.stringify({type: 'number', value: '-Infinity'});
    }
    return JSON.stringify({type: 'number', value: String(object)});
  }

  if (typeof object === 'string') {
    return JSON.stringify({type: 'string', value: object});
  }

  if (typeof object === 'boolean') {
    return JSON.stringify({type: 'boolean', value: String(object)});
  }

  if (typeof object === 'function') {
    return JSON.stringify({type: 'function', value: object.toString()});
  }

  if (object instanceof Date) {
    return JSON.stringify({type: 'date', value: object.toISOString()});
  }

  if (object instanceof Error) {
    return JSON.stringify({type: 'error', value: object.message});
  }

  if (Array.isArray(object)) {
    const serializedElements = object.map((el) => serialize(el));
    return JSON.stringify({type:'array', value: serializedElements});
  }

  if (typeof object === 'object') {
    const serializedObj = {};
    for (const key of Object.keys(object)) {
      serializedObj[key] = serialize(object[key]);
    }
    return JSON.stringify({type: 'object', value: serializedObj});
  }

  throw new Error('Unsupported type: Not implemented');
}


/**
 * @param {string} string
 * @returns {any}
 */
function deserialize(string) {
  if (typeof string !== 'string') {
    throw new Error(`Invalid argument type: ${typeof string}.`);
  }

  const p = JSON.parse(string);
  const {type, value} = p;
  switch (type) {
    case 'number':
      if (value === 'NaN') return NaN;
      if (value === 'Infinity') return Infinity;
      if (value === '-Infinity') return -Infinity;
      return Number(value);

    case 'string':
      return value;

    case 'boolean':
      return value === 'true';

    case 'null':
      return null;

    case 'undefined':
      return undefined;

    case 'function':
      return eval('(' + value + ')');

    case 'date':
      return new Date(value);

    case 'error':
      return new Error(value);

    case 'array':
      return value.map((el) => deserialize(el));

    case 'object':
      const result = {};
      for (const key of Object.keys(value)) {
        result[key] = deserialize(value[key]);
      }
      return result;
    
    default:
      throw new Error(`Unknown serialized type: ${type}`);
  }

}

module.exports = {
  serialize,
  deserialize,
};
