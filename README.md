rediscache
==========

A Redis caching library meant to be used with [exp-asynccache](https://github.com/ExpressenAB/exp-asynccache).

Usage:

```javascript
const cache = new AsyncCache(new RedisCache());

const hit = cache.lookup("foo", (resolve) => {
  resolve(null, "baz");
});

hit.then((value) => {
  console.log(value); // value will be "baz"
});
```

Values cached with a maxAge uses Redis's SETEX command and sets a TTL on the key.

```javascript
const cache = new AsyncCache(new RedisCache());

const hit = cache.lookup("foo", (resolve) => {
  resolve(null, "baz", 1000);
});

hit.then((value) => {
  console.log(value); // value will be "baz"
});
```

The underlying Redis client will queue up any commands if Redis is down. If you want instant errors back you can set the `enableOfflineQueue` option to `false`. This allows [exp-asynccache](https://github.com/ExpressenAB/exp-asynccache) to transparently fall back to the resolve callback in such a case.

```javascript
const cache = new AsyncCache(new RedisCache({
  enableOfflineQueue: false
}));
```

To namespace your cache keys (in case you run multiple apps against the same Redis), you can specify the `keyPrefix` option.

```javascript
const cache = new AsyncCache(new RedisCache({
  keyPrefix: "namespace"
}));
```

## Dev

For local development and running tests:

```bash
$ npm ci
$ docker-compose up // starts the local redis instance
$ npm test
```
