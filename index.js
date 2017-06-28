"use strict";
var DEFAULT_RETRY_MS = 2000;
var Promise = require("bluebird"),
  EventEmitter = require("events"),
  util = require("util"),
  redis = require("redis");

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
  if (value === "null") {
    return null;
  }

  if (value === "undefined") {
    return undefined;
  }

  return JSON.parse(value);
}

function deserializeAll(values) {
  return values.map(deserialize);
}

function RedisCache(options) {
  options = options || {};
  EventEmitter.call(this);

  var self = this;
  options.retry_strategy = options.retry_strategy || function () { return DEFAULT_RETRY_MS; };
  this.poolResolveTimeMs = (options && options.poolTime) || 20;
  this.resolveGetPoolTimer = false;
  this.getPool = [];
  this.client = redis.createClient(options);
  this.client.on("error", function (err) {
    self.emit("error", err);
  });

  this.client.getAsync = Promise.promisify(this.client.get);
  this.client.getAllAsync = Promise.promisify(this.client.mget);
  this.client.setexAsync = Promise.promisify(this.client.setex);
  this.client.setAsync = Promise.promisify(this.client.set);
  this.client.delAsync = Promise.promisify(this.client.del);
  this.client.keysAsync = Promise.promisify(this.client.keys);

  this.get = function (key) {
    return self.addGetToPool(key);
  };

  this.addGetToPool = function (key) {
    return new Promise(function(resolve, reject){
      const getVO = {
        key: key,
        resolve: resolve,
        reject: reject
      };
      self.getPool.push(getVO);
      if(!self.resolveGetPoolTimer) {
        //clearTimeout(self.resolveGetPoolTimer);
        self.resolveGetPoolTimer = setTimeout(self.resolveGetPool, self.poolResolveTimeMs);
      }
    });
  };

  this.resolveGetPool = function () {
    self.resolveGetPoolTimer = false;
    var localGetPool = self.getPool.slice(0);
    self.getPool = [];
    var keys = localGetPool.map(function (getVO) {
      return getVO.key;
    });
    self.getAll(keys)
      .then(function (serializedItems) {
        localGetPool.forEach(function (getVO, index) {
          getVO.resolve(serializedItems[index]);
        });
      })
      .catch(function (err) {
        localGetPool.forEach(function (getVO) {
          getVO.reject(err);
        });
      });

  };

  this.getAll = function (keys) {
    return this.client.getAllAsync(keys).then(deserializeAll);
  };
  this.peek = function (key) {
    return this.get(key);
  };
  this.has = function (key) {
    return this.client.getAsync(key).then(function (value) {
      return value !== null;
    });
  };
  this.set = function (key, value, maxAge) {
    var hasTtl = (typeof maxAge === "number");
    if (hasTtl && maxAge <= 0) {
      return Promise.resolve();
    } else if (hasTtl && maxAge > 0) {
      return this.client.setexAsync(key, Math.round(maxAge / 1000), serialize(value));
    } else if (options && options.maxAge !== undefined){
      return this.set(key, value, options.maxAge);
    } else {
      return this.client.setAsync(key, serialize(value));
    }
  };
  this.del = function (key) {
    return this.client.delAsync(key);
  };
  this.reset = function () {
    return this.client.keysAsync("*").then(function (keys) {
      return Promise.map(keys, function (key) {
        return self.del(key);
      });
    });
  };
}

util.inherits(RedisCache, EventEmitter);

module.exports = RedisCache;
