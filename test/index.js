"use strict";

const RedisCache = require("../");
const Redis = require("ioredis");

describe("RedisCache", () => {
  let client;
  before(async () => {
    client = new Redis();
  });
  beforeEach(() => {
    return client.flushdb();
  });
  after(() => {
    return client.disconnect();
  });

  it("should pass options to redis client", () => {
    const options = {
      host: "127.0.0.1",
      port: 6379,
      retryStrategy: () => {}
    };
    const target = new RedisCache(options);
    expect(target.client.options).to.include(options);
  });

  it("should add retryStategy option if none specified", () => {
    const options = {
      host: "127.0.0.1",
      port: 6379
    };
    const target = new RedisCache(options);
    expect(target.client.options).to.have.property("retryStrategy");
    expect(target.client.options.retryStrategy()).to.equal(2000);
  });

  it("should get the value from redis as json", async () => {
    await client.set("key", JSON.stringify("value"));

    const target = new RedisCache();
    const value = await target.get("key");
    expect(value).to.equal("value");
  });

  it("should return null if value in redis is \"null\"", async () => {
    await client.set("key", "null");

    const target = new RedisCache();
    const value = await target.get("key");
    expect(value).to.equal(null);
  });

  // undefined means "not found" in contract with exp-asynccache so we cannot return it.
  it("should return \"undefined\" if value in redis is \"undefined\"", async () => {
    await client.set("key", "undefined");

    const target = new RedisCache();
    const value = await target.get("key");
    expect(value).to.equal("undefined");
  });

  it("should emit client errors", (done) => {
    const target = new RedisCache();
    target.on("error", (err) => {
      expect(err).to.be.instanceOf(Error);
      expect(err.message).to.equal("error");
      done();
    });
    target.client.emit("error", new Error("error"));
  });

  it("should emit client connection", (done) => {
    const target = new RedisCache();
    target.on("connect", done);
  });

  it("should delete the key from redis", async () => {
    await client.set("key", JSON.stringify("value"));

    const target = new RedisCache();
    await target.del("key");
    const value = await target.has("key");
    expect(value).to.equal(false);
  });

  it("should delete all keys from redis when resetting", async () => {
    await client.set("key", JSON.stringify("value"));
    await client.set("key2", JSON.stringify("value"));

    const target = new RedisCache();
    await target.reset();

    let value = await target.has("key");
    expect(value).to.equal(false);

    value = await target.has("key2");
    expect(value).to.equal(false);
  });

  it("should peek the value from redis as json", async () => {
    await client.set("key", JSON.stringify("value"));

    const target = new RedisCache();
    const value = await target.peek("key");
    expect(value).to.equal("value");
  });

  it("should have the key if it is set", async () => {
    await client.set("key", JSON.stringify("value"));

    const target = new RedisCache();
    const value = await target.has("key");
    expect(value).to.equal(true);
  });

  it("should have the key if it is set to \"null\"", async () => {
    await client.set("key", "null");

    const target = new RedisCache();
    const value = await target.has("key");
    expect(value).to.equal(true);
  });

  it("should have the key if it is set to \"undefined\"", async () => {
    await client.set("key", "undefined");

    const target = new RedisCache();
    const value = await target.has("key");
    expect(value).to.equal(true);
  });

  it("should not have the key if it is missing", async () => {
    const target = new RedisCache();
    const value = await target.has("key");
    expect(value).to.equal(false);
  });

  it("should return undefined if key is missing", async () => {
    const target = new RedisCache();
    const value = await target.get("key");
    expect(value).to.equal(undefined);
  });

  it("should set the value in redis with ttl in nearest seconds", async () => {
    const target = new RedisCache();
    await target.set("key", "value", 1500);

    const ttl = await client.ttl("key");
    expect(ttl).to.be.within(1, 2);
  });

  it("should not set the value in redis if ttl is less than 1", async () => {
    const target = new RedisCache();
    await target.set("key", "value", 0);

    const value = await client.get("key");
    expect(value).to.equal(null);
  });

  it("should set the value in redis permanently if without ttl", async () => {
    const target = new RedisCache();
    await target.set("key", "value");

    const ttl = await client.ttl("key");
    expect(ttl).to.equal(-1);
  });

  it("should set the value in redis permanently if maxAge is empty string", async () => {
    const target = new RedisCache({maxAge: ""});
    await target.set("key", "value");

    const ttl = await client.ttl("key");
    expect(ttl).to.equal(-1);
  });

  it("should set the value in redis with a ttl if given in constructor options", async () => {
    const target = new RedisCache({maxAge: 1000});
    await target.set("key", "value");

    const ttl = await client.ttl("key");
    expect(ttl).to.equal(1);
  });

  it("should set the value in redis with a specifically given ttl that overrides global default values", async () => {
    const target = new RedisCache({maxAge: 1000});
    await target.set("key", "value", 2000);

    const ttl = await client.ttl("key");
    expect(ttl).to.equal(2);
  });

  it("should set the value in redis with a ttl if given as a parsable number in a string", async () => {
    const target = new RedisCache({maxAge: "1000"});
    await target.set("key", "value");

    const ttl = await client.ttl("key");
    expect(ttl).to.equal(1);
  });

  it("should set the value in redis without a ttl if default options was given as an empty string", async () => {
    const target = new RedisCache({maxAge: ""});
    await target.set("key", "value");

    const ttl = await client.ttl("key");
    expect(ttl).to.equal(-1);
  });

  ["unknown", "Infinity", "-Infinity", " ", {}, [], Infinity, Math.random].map((input) => {
    it(`should throw on initialization if maxAge is '${input}'`, async () => {
      try {
        return new RedisCache({maxAge: input});
      } catch (error) {
        expect(error.message).to.equal(`Unparsable maxAge option: '${input}'`);
      }
    });
  });
});
