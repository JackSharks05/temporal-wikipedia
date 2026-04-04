// @ts-check

/**
 * @param {any} object
 * @returns {string}
 */
function serialize(object) {
  if (object === null) {
    return JSON.stringify({type:'null'});
  }
  if (typeof object === 'undefined') {
    return JSON.stringify({type:'undefined'});
  }
  if (typeof object === 'number') {
    return JSON.stringify({type:'number',value:String(object)});
  }
  if (typeof object === 'function') {
    return JSON.stringify({type:'function',value:object.toString()});
  }
  if (object instanceof Date) {
    return JSON.stringify({type:'Date',value:object.toISOString()});
  }
  if (object instanceof Error) {
    return JSON.stringify({type:'Error',value:{name:object.name,message:object.message}});
  }
  if (Array.isArray(object)) {
  const items = [];
  for (let i = 0; i < object.length; i++) {
    items.push(serialize(object[i]));
  }
  return JSON.stringify({type:'Array', value:items });
  }
  if (typeof object === 'object') {
    const out = {};
    for (const k in object) {
      out[k] = serialize(object[k]);
    }
    return JSON.stringify({type:'Object',value:out});
  }
  else {
    return JSON.stringify(object);
  }
}


/**
 * @param {string} string
 * @returns {any}
 */
function deserialize(string) {
  if (typeof string !== 'string') {
    throw new Error(`Invalid argument type: ${typeof string}.`);
  }

  let parsed= JSON.parse(string);
  
  if (typeof parsed !== 'object') {
    return parsed;
  }
  switch(parsed.type) {
    case 'number':
      if (parsed.value === 'NaN') return NaN;
      if (parsed.value === 'Infinity') return Infinity;
      if (parsed.value === '-Infinity') return -Infinity;
      return Number(parsed.value);
    case 'undefined':
      return undefined;
    case 'null':
      return null;
    case 'string':
      return parsed.value;
    case 'boolean':
      return parsed.value;
    case 'function':
      return Function('return (' + parsed.value + ')')();
    case 'Function':
      return Function('return (' + parsed.value + ')')();
    case 'Date':
      return new Date(parsed.value);
    case 'Error': {
      const e = new Error(parsed.value && parsed.value.message);
      if (parsed.value && parsed.value.name) e.name = parsed.value.name;
      return e;
    }
    case 'Array': {
      const arr = [];
      const v = parsed.value || [];
      
      for (let i = 0; i < v.length; i++){
        arr.push(deserialize(v[i]));
      }
      return arr;
    }
    case 'Object': {
      const obj = {};
      const v = parsed.value || {};
      for (const k in v) {
        obj[k] = deserialize(v[k]);
      }
      return obj;
    }
  }
  throw new Error(`Unknown serialized type: ${parsed.type}`);
}

module.exports = {
  serialize,
  deserialize,
};
