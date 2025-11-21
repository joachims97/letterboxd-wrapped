const NodeCache = require('node-cache');

const DEFAULT_TTL_SECONDS = 60 * 60 * 24; // 1 day

const cache = new NodeCache({
  stdTTL: DEFAULT_TTL_SECONDS,
  checkperiod: 120,
  useClones: false,
});

module.exports = {
  get(key) {
    return cache.get(key);
  },
  set(key, value, ttlSeconds = DEFAULT_TTL_SECONDS) {
    cache.set(key, value, ttlSeconds);
    return value;
  },
  stats() {
    return cache.getStats();
  },
  flush() {
    cache.flushAll();
  },
};

