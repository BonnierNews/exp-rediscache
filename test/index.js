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
      mget: function (keys, callback) {
        if (keys === "error") {
          return callback(new Error("redis error"));
        }
        const results = [];
        keys.forEach(function(key){
          if (cache.hasOwnProperty(key)) {
            results.push(cache[key].value);
          }
          else {
            results.push(null);
          }
        });
        callback(null, results);
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
      port: 6379,
      retry_strategy: function() {}
    };
    var target = new RedisCache(options);
    target.client.options.should.eql(options);
  });

  it("should add retry_stategy option if none specified", function () {
    var options = {
      host: "127.0.0.1",
      port: 6379
    };
    var target = new RedisCache(options);
    target.client.options.should.have.property("retry_strategy");
    target.client.options.retry_strategy().should.eql(2000);
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
    });
  });

  it("should return null if value in redis is \"null\"", function (done) {
    var options = {
      cache: {
        key: {
          value: "null"
        }
      }
    };
    var target = new RedisCache(options);
    target.get("key").then(function (value) {
      assert(value === null);
      done();
    });
  });

  // undefined means "not found" in contract with exp-asynccache so we cannot return it.
  it("should return \"undefined\" if value in redis is \"undefined\"", function (done) {
    var options = {
      cache: {
        key: {
          value: "undefined"
        }
      }
    };
    var target = new RedisCache(options);
    target.get("key").then(function (value) {
      assert(value === "undefined");
      done();
    });
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
      });
    });
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
        });
      });
    });
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
    });
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
    });
  });

  it("should have the key if it is set to \"null\"", function (done) {
    var options = {
      cache: {
        key: {
          value: "null"
        }
      }
    };
    var target = new RedisCache(options);
    target.has("key").then(function (value) {
      value.should.equal(true);
      done();
    });
  });

  it("should have the key if it is set to \"undefined\"", function (done) {
    var options = {
      cache: {
        key: {
          value: "undefined"
        }
      }
    };
    var target = new RedisCache(options);
    target.has("key").then(function (value) {
      value.should.equal(true);
      done();
    });
  });

  it("should not have the key if it is missing", function (done) {
    var target = new RedisCache();
    target.has("key").then(function (value) {
      value.should.equal(false);
      done();
    });
  });

  it("should return undefined if key is missing", function (done) {
    var target = new RedisCache();
    target.get("key").then(function (value) {
      assert(value === undefined);
      done();
    });
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
    });
  });

  it("should not set the value in redis if ttl is less than 1", function (done) {
    var target = new RedisCache();
    target.set("key", "value", 0).then(function () {
      assert(target.client.cache.key === undefined);
      done();
    });
  });

  it("should set the value in redis permanently if without ttl", function (done) {
    var target = new RedisCache();
    target.set("key", "value").then(function () {
      assert(target.client.cache.key.ttl === null);
      done();
    });
  });

  it("should set the value in redis permanently if maxAge is empty string", function (done) {
    var target = new RedisCache({ maxAge: ""});
    target.set("key", "value")

    assert(target.client.cache.key.ttl === null);
    done()
  });

  it("should set the value in redis with a ttl if given in options", function (done) {
    var target = new RedisCache({ maxAge: 1000 });
    target.set("key", "value", 2000).then(function () {
      target.client.cache.key.ttl.should.equal(2);
      done();
    });
  });

    it("should set the value in redis with a ttl if given as a parsable number in a string", function (done) {
      var target = new RedisCache({ maxAge: "1000"});
      target.set("key", "value").then(function () {
        target.client.cache.key.ttl.should.equal(1);
        done();
      });
    });

  it("should throw on initialization if maxAge is a unparsable strings", function (done) {
    try {
      new RedisCache({ maxAge: "unknown"});
    } catch(error) {
      error.message.should.equal("Unparsable maxAge option: 'unknown'")
      done()
    }
  });

  it("should set the value in redis as json", function (done) {
    var target = new RedisCache();
    target.set("key", { field: "value" }, 1500).then(function () {
      target.client.cache.key.value.should.equal("{\"field\":\"value\"}");
      done();
    });
  });

  it("should reject the promise on set error from redis", function (done) {
    var target = new RedisCache();
    target.set("error", "value", 1500).then(done, function () {
      done();
    });
  });
});
