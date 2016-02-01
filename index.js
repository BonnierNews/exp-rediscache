"use strict";
var Promise = require("bluebird"),
    EventEmitter = require("events"),
    util = require("util"),
    redis = require("redis");

function RedisCache(options) {
  EventEmitter.call(this);

  var self = this;
  this.client = redis.createClient(options);
  this.client.on("error", function (err) {
    self.emit("error", err);
  });

  this.client.getAsync = Promise.promisify(this.client.get);
  this.client.setexAsync = Promise.promisify(this.client.setex);
  this.client.setAsync = Promise.promisify(this.client.set);
  this.client.delAsync = Promise.promisify(this.client.del);
  this.client.keysAsync = Promise.promisify(this.client.keys);
  this.get = function (key) {
    return this.client.getAsync(key).then(function (res) {
      if (res !== null && res !== undefined) {
        return JSON.parse(res);
      }

      return res;
    });
  };
  this.peek = function (key) {
    return this.get(key);
  };
  this.has = function (key) {
    return this.get(key).then(function (value) {
      return value !== null;
    });
  };
  this.set = function (key, value, ttl) {
    if (value === null || value === undefined) {
      return Promise.resolve();
    }

    if (ttl > 0) {
      return this.client.setexAsync(key, Math.round(ttl / 1000), JSON.stringify(value));
    } else {
      return this.client.setAsync(key, JSON.stringify(value));
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
