"use strict";
const DEFAULT_RETRY_MS = 2000;
const EventEmitter = require("events");
const util = require("util");
const redis = require("redis");

// bluebird polyfill
Promise.map = function(iterable, mapper, options) {
  options = options || {};
  let concurrency = options.concurrency || Infinity;

  let index = 0;
  const results = [];
  const iterator = iterable[Symbol.iterator]();
  const promises = [];

  while (concurrency-- > 0) {
    const promise = wrappedMapper();
    if (promise) promises.push(promise);
    else break;
  }

  return Promise.all(promises).then(() => results);

  function wrappedMapper() {
    const next = iterator.next();
    if (next.done) return null;
    const i = index++;
    const mapped = mapper(next.value, i);
    return Promise.resolve(mapped).then((resolved) => {
      results[i] = resolved;
      return wrappedMapper();
    });
  }
};

function serialize(value) {
  if (value === null) {
    return "null";
  }

  if (value === undefined) {
    return "undefined";
  }

  return JSON.stringify(value);
}

function deserialize(value) {
  // Contract with exp-asynccache requires us to return undefined for missing keys
  // Redis client returns null for missing keys
  if (value === null) {
    return undefined;
  }

  if (value === "undefined") {
    return "undefined";
  }

  return JSON.parse(value);
}

function deserializeAll(values) {
  return values.map(deserialize);
}

function RedisCache(options) {
  options = options || {};
  EventEmitter.call(this);

  const self = this;
  options.retry_strategy =
    options.retry_strategy ||
    function() {
      return DEFAULT_RETRY_MS;
    };
  if (options.maxAge && isNaN(options.maxAge)) {
    throw new Error(`Unparsable maxAge option: '${options.maxAge}'`);
  }
  this.poolResolveTimeMs = options.poolTime;
  this.resolveGetPoolTimer = false;
  this.getPool = [];
  this.client = redis.createClient(options);
  this.client.on("error", function(err) {
    self.emit("error", err);
  });

  this.client.getAsync = util.promisify(this.client.get);
  this.client.getAllAsync = util.promisify(this.client.mget);
  this.client.setexAsync = util.promisify(this.client.setex);
  this.client.setAsync = util.promisify(this.client.set);
  this.client.delAsync = util.promisify(this.client.del);
  this.client.keysAsync = util.promisify(this.client.keys);

  this.get = function(key) {
    if (this.poolResolveTimeMs && this.poolResolveTimeMs > 0) {
      return this.addGetToPool(key);
    } else {
      return this.client.getAsync(key).then(deserialize);
    }
  };

  this.addGetToPool = function(key) {
    return new Promise(function(resolve, reject) {
      const getVO = {
        key: key,
        resolve: resolve,
        reject: reject
      };
      self.getPool.push(getVO);
      if (!self.resolveGetPoolTimer) {
        if (self.poolResolveTimeMs === 1) {
          self.resolveGetPoolTimer = true;
          setImmediate(self.resolveGetPool);
        } else {
          self.resolveGetPoolTimer = setTimeout(
            self.resolveGetPool,
            self.poolResolveTimeMs
          );
        }
      }
    });
  };

  this.resolveGetPool = function() {
    self.resolveGetPoolTimer = false;
    const localGetPool = self.getPool.slice(0);
    self.getPool = [];
    const keys = localGetPool.map(function(getVO) {
      return getVO.key;
    });
    self
      .getAll(keys)
      .then(function(serializedItems) {
        localGetPool.forEach(function(getVO, index) {
          getVO.resolve(serializedItems[index]);
        });
      })
      .catch(function(err) {
        localGetPool.forEach(function(getVO) {
          getVO.reject(err);
        });
      });
  };

  this.getAll = function(keys) {
    return this.client.getAllAsync(keys).then(deserializeAll);
  };
  this.peek = function(key) {
    return this.get(key);
  };
  this.has = function(key) {
    return this.client.getAsync(key).then(function(value) {
      return value !== null;
    });
  };
  this.set = function(key, value, maxAge) {
    const hasTtl = typeof maxAge === "number";
    const hasDefaultMaxAge = options && options.maxAge;

    if (hasTtl && maxAge <= 0) {
      return Promise.resolve();
    } else if (hasTtl && maxAge > 0) {
      return this.client.setexAsync(
        key,
        Math.round(maxAge / 1000),
        serialize(value)
      );
    } else if (hasDefaultMaxAge) {
      return this.set(key, value, Number(options.maxAge));
    } else {
      return this.client.setAsync(key, serialize(value));
    }
  };
  this.del = function(key) {
    return this.client.delAsync(key);
  };
  this.reset = function() {
    return this.client.keysAsync("*").then(function(keys) {
      return Promise.map(keys, function(key) {
        return self.del(key);
      });
    });
  };
}

util.inherits(RedisCache, EventEmitter);

module.exports = RedisCache;
