rediscache
==========

A Redis caching library meant to be used with [exp-asynccache](https://github.com/ExpressenAB/exp-asynccache).

Usage:

```javascript
var cache = new AsyncCache(new RedisCache());

var hit = cache.lookup("foo", function (resolve) {
  resolve(null, "baz");
});

hit.then(function (value) {
  console.log(value); // value will be "baz"
});
```

Values cached with a maxAge uses Redis's SETEX command and sets a TTL on the key.

```javascript
var cache = new AsyncCache(new RedisCache());

var hit = cache.lookup("foo", function (resolve) {
  resolve(null, "baz", 1000);
});

hit.then(function (value) {
  console.log(value); // value will be "baz"
});
```

The underlying Redis client will queue up any commands if Redis is down. If you want instant errors back you can set the `enable_offline_queue` option to `false`. This allows [exp-asynccache](https://github.com/ExpressenAB/exp-asynccache) to transparently fall back to the resolve callback in such a case.

```javascript
var cache = new AsyncCache(new RedisCache({
  enable_offline_queue: false
}));
```

To namespace your cache keys (in case you run multiple apps against the same Redis), you can specify the `prefix` option.

```javascript
var cache = new AsyncCache(new RedisCache({
  prefix: "namespace"
}));
```

## Dev

For local development and running tests:

```bash
$ npm ci
$ docker-compose up // starts the local redis instance
$ npm test
```
