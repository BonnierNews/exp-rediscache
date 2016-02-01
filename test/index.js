"use strict";
require("chai").should();

var redisStub = {
  createClient: function (options) {
    var cache = (options || {}).cache || {};
    var onCallbacks = {};
    return {
      cache: cache,
      options: options,
      get: function (key, callback) {
        if (key === "error") {
          return callback(new Error("redis error"));
        }
        if (cache.hasOwnProperty(key)) {
          callback(null, cache[key].value);
        }
        else {
          callback(null, null);
        }
      },
      setex: function (key, ttl, value, callback) {
        if (key === "error") {
          return callback(new Error("redis error"));
        }
        cache[key] = {
          value: value,
          ttl: ttl
        };
        callback(null, null);
      },
      set: function (key, value, callback) {
        if (key === "error") {
          return callback(new Error("redis error"));
        }
        cache[key] = {
          value: value,
          ttl: null
        };
        callback(null, null);
      },
      del: function (key, callback) {
        delete cache[key];
        callback();
      },
      keys: function (filter, callback) {
        callback(null, Object.keys(cache));
      },
      on: function (event, callback) {
        if (!onCallbacks[event]) {
          onCallbacks[event] = [callback];
        } else {
          onCallbacks[event].push(callback);
        }
      },
      emit: function (event, err) {
        if (onCallbacks[event]) {
          for (var i = 0; i < onCallbacks[event].length; i++) {
            onCallbacks[event][i](err);
          }
        }
      }
    };
  }
};
var proxyquire = require("proxyquire"),
    RedisCache = proxyquire("../", { redis: redisStub }),
    assert = require("assert");

describe("RedisCache", function () {
  it("should pass options to redis client", function () {
    var options = {
      host: "127.0.0.1",
      port: 6379
    };
    var target = new RedisCache(options);
    target.client.options.should.eql(options);
  });

  it("should get the value from redis as json", function (done) {
    var options = {
      cache: {
        key: {
          value: "\"value\""
        }
      }
    };
    var target = new RedisCache(options);
    target.get("key").then(function (value) {
      value.should.equal("value");
      done();
    }, done);
  });

  it("should emit client errors", function (done) {
    var target = new RedisCache();
    target.on("error", function (err) {
      assert(err);
      err.message.should.equal("error");
      done();
    });
    target.client.emit("error", new Error("error"));
  });

  it("should delete the key from redis", function (done) {
    var options = {
      cache: {
        key: {
          value: "\"value\""
        }
      }
    };
    var target = new RedisCache(options);
    target.del("key").then(function () {
      target.has("key").then(function (value) {
        value.should.equal(false);
        done();
      }, done);
    }, done);
  });

  it("should delete all keys from redis when resetting", function (done) {
    var options = {
      cache: {
        key: {
          value: "\"value\""
        },
        key2: {
          value: "\"value\""
        }
      }
    };
    var target = new RedisCache(options);
    target.reset().then(function () {
      target.has("key").then(function (value) {
        value.should.equal(false);
        target.has("key2").then(function (value) {
          value.should.equal(false);
          done();
        }, done);
      }, done);
    }, done);
  });

  it("should peek the value from redis as json", function (done) {
    var options = {
      cache: {
        key: {
          value: "\"value\""
        }
      }
    };
    var target = new RedisCache(options);
    target.peek("key").then(function (value) {
      value.should.equal("value");
      done();
    }, done);
  });

  it("should have the key if it is set", function (done) {
    var options = {
      cache: {
        key: {
          value: "\"value\""
        }
      }
    };
    var target = new RedisCache(options);
    target.has("key").then(function (value) {
      value.should.equal(true);
      done();
    }, done);
  });

  it("should not have the key if it is missing", function (done) {
    var target = new RedisCache();
    target.has("key").then(function (value) {
      value.should.equal(false);
      done();
    }, done);
  });

  it("should reject the promise on get error from redis", function (done) {
    var target = new RedisCache();
    target.get("error").then(done, function () {
      done();
    });
  });

  it("should set the value in redis with ttl in nearest seconds", function (done) {
    var target = new RedisCache();
    target.set("key", "value", 1500).then(function () {
      target.client.cache.key.ttl.should.equal(2);
      done();
    }, done);
  });

  it("should set the value in redis permanently if without ttl", function (done) {
    var target = new RedisCache();
    target.set("key", "value").then(function () {
      assert(target.client.cache.key.ttl === null);
      done();
    }, done);
  });

  it("should set the value in redis as json", function (done) {
    var target = new RedisCache();
    target.set("key", { field: "value" }, 1500).then(function () {
      target.client.cache.key.value.should.equal("{\"field\":\"value\"}");
      done();
    }, done);
  });

  it("should reject the promise on set error from redis", function (done) {
    var target = new RedisCache();
    target.set("error", "value", 1500).then(done, function () {
      done();
    });
  });
});
