"use strict";

const EventEmitter = require("events");
const Redis = require("ioredis");

const DEFAULT_RETRY_MS = 2000;

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

class RedisCache extends EventEmitter {
  constructor(options = {}) {
    super(options);

    /* eslint-disable no-console */
    if (typeof options.retry_strategy !== "undefined") {
      console.warn("retry_strategy is deprecated, please use retryStrategy instead.");
      options.retryStrategy = options.retry_strategy;
    }
    options.retryStrategy = options.retryStrategy || (() => DEFAULT_RETRY_MS);

    if (typeof options.prefix !== "undefined") {
      console.warn("prefix is deprecated, please use keyPrefix instead.");
      options.keyPrefix = options.prefix;
    }

    if (typeof options.no_ready_check !== "undefined") {
      console.warn("no_ready_check is deprecated, please use enableReadyCheck instead.");
      options.enableReadyCheck = !options.no_ready_check;
    }

    if (typeof options.enable_offline_queue !== "undefined") {
      console.warn("enable_offline_queue is deprecated, please use enableOfflineQueue instead.");
      options.enableOfflineQueue = options.enable_offline_queue;
    }
    /* eslint-enable */

    this.options = options;
    const isNumberRegEx = /^\d+$/;

    if (options.maxAge && options.maxAge !== "number" && !isNumberRegEx.test(options.maxAge)) {
      throw new Error(`Unparsable maxAge option: '${options.maxAge}'`);
    }
    this.poolResolveTimeMs = options.poolTime;
    this.resolveGetPoolTimer = false;
    this.getPool = [];
    this.client = new Redis(options);
    this.client.on("error", (err) => {
      this.emit("error", err);
    });
  }

  async get(key) {
    if (this.poolResolveTimeMs && this.poolResolveTimeMs > 0) {
      return this.addGetToPool(key);
    } else {
      const value = await this.client.get(key);
      return deserialize(value);
    }
  }

  addGetToPool(key) {
    return new Promise((resolve, reject) => {
      const getVO = {
        key,
        resolve,
        reject
      };
      this.getPool.push(getVO);
      if (!this.resolveGetPoolTimer) {
        if (this.poolResolveTimeMs === 1) {
          this.resolveGetPoolTimer = true;
          setImmediate(this.resolveGetPool);
        } else {
          this.resolveGetPoolTimer = setTimeout(
            this.resolveGetPool,
            this.poolResolveTimeMs
          );
        }
      }
    });
  }

  resolveGetPool() {
    this.resolveGetPoolTimer = false;
    const localGetPool = this.getPool.slice(0);
    this.getPool = [];
    const keys = localGetPool.map((getVO) => getVO.key);
    this
      .getAll(keys)
      .then((serializedItems) => {
        localGetPool.forEach((getVO, index) => {
          getVO.resolve(serializedItems[index]);
        });
      })
      .catch((err) => {
        localGetPool.forEach((getVO) => {
          getVO.reject(err);
        });
      });
  }

  async getAll(keys) {
    const values = await this.client.mget(keys);
    return deserializeAll(values);
  }

  peek(key) {
    return this.get(key);
  }

  async has(key) {
    const value = await this.client.get(key);
    return value !== null;
  }

  set(key, value, maxAge) {
    const hasTtl = typeof maxAge === "number";
    const hasDefaultMaxAge = this.options.maxAge;

    if (hasTtl && maxAge <= 0) {
      return Promise.resolve();
    } else if (hasTtl && maxAge > 0) {
      return this.client.setex(
        key,
        Math.round(maxAge / 1000),
        serialize(value)
      );
    } else if (hasDefaultMaxAge) {
      return this.set(key, value, Number(this.options.maxAge));
    } else {
      return this.client.set(key, serialize(value));
    }
  }

  del(key) {
    return this.client.del(key);
  }

  async reset() {
    const keys = await this.client.keys("*");
    const deleters = keys.map((key) => this.del(key));
    return Promise.all(deleters);
  }
}

module.exports = RedisCache;
