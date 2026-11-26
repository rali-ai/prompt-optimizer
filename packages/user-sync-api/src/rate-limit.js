export function createRateLimiter({ max, windowMs, maxEntries = 10000 }) {
  const cap = Number.isInteger(maxEntries) && maxEntries > 0 ? maxEntries : 10000;
  const buckets = new Map();

  function pruneExpired(now) {
    for (const [key, entry] of buckets.entries()) {
      if (entry.resetAt <= now) {
        buckets.delete(key);
      }
    }
  }

  function ensureCapacityForNewKey(now) {
    if (buckets.size < cap) return;
    pruneExpired(now);
    while (buckets.size >= cap) {
      const oldestKey = buckets.keys().next().value;
      if (oldestKey === undefined) break;
      buckets.delete(oldestKey);
    }
  }

  return {
    consume(key) {
      const now = Date.now();
      let entry = buckets.get(key);
      if (entry && entry.resetAt <= now) {
        buckets.delete(key);
        entry = undefined;
      }
      if (!entry) {
        ensureCapacityForNewKey(now);
        entry = { count: 0, resetAt: now + windowMs };
        buckets.set(key, entry);
      }
      entry.count += 1;
      const allowed = entry.count <= max;
      const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      return {
        allowed,
        remaining: Math.max(0, max - entry.count),
        retryAfterSec,
      };
    },
    check(key) {
      const now = Date.now();
      const entry = buckets.get(key);
      if (!entry || entry.resetAt <= now) {
        if (entry) buckets.delete(key);
        return {
          allowed: true,
          remaining: max,
          retryAfterSec: 0,
        };
      }
      const allowed = entry.count < max;
      const retryAfterSec = allowed ? 0 : Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      return {
        allowed,
        remaining: Math.max(0, max - entry.count),
        retryAfterSec,
      };
    },
    clear(key) {
      buckets.delete(key);
    },
    size() {
      return buckets.size;
    },
    reset() {
      buckets.clear();
    },
  };
}
