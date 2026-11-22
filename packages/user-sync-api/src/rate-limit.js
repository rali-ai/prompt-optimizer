export function createRateLimiter({ max, windowMs }) {
  const buckets = new Map();

  function prune(now) {
    if (buckets.size < 2000) return;
    for (const [key, entry] of buckets.entries()) {
      if (entry.resetAt <= now) {
        buckets.delete(key);
      }
    }
  }

  return {
    consume(key) {
      const now = Date.now();
      prune(now);
      let entry = buckets.get(key);
      if (!entry || entry.resetAt <= now) {
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
    reset() {
      buckets.clear();
    },
  };
}
