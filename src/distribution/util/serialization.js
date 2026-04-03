// @ts-check
const U = Symbol("undefined");
/**
 * @param {any} object
 * @returns {string}
 */
function serialize(object) {
  if (typeof object === "undefined" || object === undefined) {
    return "{u}";
  }
  if (object instanceof Date) {
    return "{d}" + object.toISOString();
  }
  return JSON.stringify(object, function (k, o) {
    if (this[k] instanceof Date) {
      return { type: "Date", value: this[k].toISOString() };
    }
    // if (object instanceof Date) {
    //   // console.log("serializing a date!", object.toJSON());
    //   return "{d}" + object.toISOString();
    // }
    if (o === undefined) {
      return { type: "undefined" };
    }
    if (
      o === null ||
      typeof o === "string" ||
      typeof o === "boolean" ||
      (typeof o === "number" && Number.isFinite(o))
    ) {
      return o;
    }
    if (typeof object === "string" && object.slice(0, 3) === "{d}") {
      return "{d}" + object;
    }
    if (typeof object === "string" && object.slice(0, 3) === "{u}") {
      return "{u}" + object;
    }
    if (typeof object === "undefined" || object === undefined) {
      return { type: "undefined" };
    }
    for (const [type, formulae] of Object.entries(registry)) {
      if (type === "Date" || type === "undefined") continue;
      if (formulae.verify(o)) {
        return { type: type, value: formulae.serialize(o) };
      }
    }
    // if (typeof o === "object") {
    //   return Object.fromEntries(
    //     Object.entries(o).map(([k, v]) => [k, serialize(v)]),
    //   );
    // }
    return o;
  });
}

//I decided to make a registry to hold all the custom serializing/deserializing as I had wayyy too many helper methods!
const registry = {
  Date: {
    verify: (o) => {
      if (o instanceof Date) {
        // console.log("found a date!!", o.toJSON());
        return true;
      }
    },
    serialize: (o) => {
      // console.log("serializing a date!", o.toISOString());
      return o.toISOString();
    },
    deserialize: (o) => {
      // const sliced = o.slice(3);
      // const d = new Date(sliced);
      // Object.setPrototypeOf(d, Date.prototype);
      return new Date(o);
    },
  },
  Error: {
    verify: (o) => o instanceof Error,
    serialize: (o) => ({
      name: o.name,
      message: o.message,
      stack: o.stack,
      cause: o.cause,
    }),
    deserialize: (o) => {
      let ErrorType = Error;
      if (globalThis[o.name] instanceof Function) {
        ErrorType = globalThis[o.name];
      }
      let output = new ErrorType(o.message);
      if (o.stack) {
        output.stack = o.stack;
      }
      if ("cause" in o) {
        output.cause = o.cause;
      }
      return output;
    },
  },
  undefined: {
    verify: (o) => o === undefined,
    serialize: () => null, //this is handled in serialize directly
    deserialize: () => undefined,
  },
  Number: {
    verify: (o) => typeof o === "number",
    serialize: (o) => {
      if (Object.is(o, -0)) return { type: "Number", value: "-0" }; //why is it different??? js is so silly
      if (Number.isNaN(o)) return { type: "Number", value: "NaN" };
      if (o === Infinity) return { type: "Number", value: "Infinity" };
      if (o === -Infinity) return { type: "Number", value: "-Infinity" };
      return o; //normal number
    },
    deserialize: (o) => {
      if (o === "-0") return -0;
      if (o === "NaN") return NaN;
      if (o === "Infinity") return Infinity;
      if (o === "-Infinity") return -Infinity;
      return o; //normal number
    },
  },
  Function: {
    verify: (o) => typeof o === "function",
    serialize: (o) => {
      const body = String(o);
      return {
        body,
        name: o.name || null,
      };
    },
    deserialize: (o) => {
      let fn;
      try {
        // sometimes the functions are in (a,b) => a+b form
        fn = new Function(`return (${o.body})`)();
      } catch {
        // but these are for others
        fn = new Function(`return ${o.body}`)();
      }

      if (o.name) {
        Object.defineProperty(fn, "name", { value: o.name });
      }
      return fn;
    },
  },
};

/**
 * @param {string} string
 * @returns {any}
 */
function deserialize(string) {
  if (typeof string !== "string") {
    throw new Error(`Invalid argument type: ${typeof string}.`);
  }
  if (string === "{u}") return undefined;
  if (string.startsWith("{d}")) return new Date(string.slice(3));

  const parsed = JSON.parse(string, (_, o) => {
    if (o && typeof o === "object" && "type" in o) {
      if (o.type === "undefined") {
        return U; //a marker for undefined bc it's so frustratingly elusive :(
      }
      if (o.type === "Date") {
        return new Date(o.value);
      }
      const formulae = registry[o.type];
      if (!formulae) {
        throw new Error("Oops! Unknown type! " + o.type);
      }
      return formulae.deserialize(o.value);
    }
    return o;
  });

  function restoreUndefined(o) {
    if (o === U) {
      return undefined;
    }
    if (Array.isArray(o)) {
      for (let i = 0; i < o.length; i++) {
        o[i] = restoreUndefined(o[i]);
      }
    } else if (o && typeof o === "object") {
      for (const k of Object.keys(o)) {
        o[k] = restoreUndefined(o[k]);
      }
    }
    return o;
  }
  return restoreUndefined(parsed);
}

module.exports = {
  serialize,
  deserialize,
};
