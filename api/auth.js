import crypto from 'node:crypto';

console.info(`[prompt-optimizer/runtime] Node.js ${process.version}`);

const SESSION_COOKIE_NAME = 'vercel_access_token';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7天
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15分钟
const RATE_LIMIT_MAX_ATTEMPTS = 15;
const RATE_LIMIT_MAX_BUCKETS = 2000;

const rateLimitBuckets = new Map();

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest();
}

function constantTimePasswordMatch(input, expected) {
  if (typeof input !== 'string' || typeof expected !== 'string') {
    return false;
  }
  return crypto.timingSafeEqual(sha256(input), sha256(expected));
}

export function createSessionToken(secret, nowMs = Date.now()) {
  const expMs = nowMs + SESSION_MAX_AGE_SECONDS * 1000;
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = `v1.${expMs}.${nonce}`;
  const sig = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('base64url');
  return `${payload}.${sig}`;
}

function readHeader(req, name) {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0] || '';
  return typeof value === 'string' ? value : '';
}

function getForwardedProto(req) {
  return readHeader(req, 'x-forwarded-proto').split(',')[0].trim().toLowerCase();
}

function isSecureRequest(req) {
  if (process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL)) {
    return true;
  }
  return getForwardedProto(req) === 'https';
}

function isSameOriginPost(req) {
  const secFetchSite = readHeader(req, 'sec-fetch-site').trim().toLowerCase();
  if (secFetchSite === 'cross-site') {
    return false;
  }

  const origin = readHeader(req, 'origin').trim();
  if (!origin) {
    return true;
  }

  const rawHost = (readHeader(req, 'x-forwarded-host') || readHeader(req, 'host'))
    .split(',')[0]
    .trim()
    .toLowerCase();
  if (!rawHost) {
    return false;
  }

  let originUrl;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }

  if (originUrl.protocol !== 'http:' && originUrl.protocol !== 'https:') {
    return false;
  }

  if (originUrl.host.toLowerCase() !== rawHost) {
    return false;
  }

  const forwardedProto = getForwardedProto(req);
  if ((forwardedProto === 'http' || forwardedProto === 'https') && originUrl.protocol !== `${forwardedProto}:`) {
    return false;
  }

  return true;
}

function getClientIp(req) {
  const realIp = readHeader(req, 'x-real-ip').trim();
  if (realIp) {
    return realIp;
  }

  const xff = readHeader(req, 'x-forwarded-for');
  if (xff) {
    const hops = xff
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (hops.length > 0) {
      return hops[hops.length - 1];
    }
  }

  return req.socket?.remoteAddress || 'unknown';
}

function consumeRateLimit(ip, nowMs = Date.now()) {
  let entry = rateLimitBuckets.get(ip);
  if (entry && nowMs >= entry.resetAt) {
    rateLimitBuckets.delete(ip);
    entry = undefined;
  }

  if (!entry) {
    if (rateLimitBuckets.size >= RATE_LIMIT_MAX_BUCKETS) {
      for (const [key, bucket] of rateLimitBuckets) {
        if (nowMs >= bucket.resetAt) {
          rateLimitBuckets.delete(key);
        }
      }
      if (rateLimitBuckets.size >= RATE_LIMIT_MAX_BUCKETS) {
        const oldestKey = rateLimitBuckets.keys().next().value;
        if (oldestKey !== undefined) {
          rateLimitBuckets.delete(oldestKey);
        }
      }
    }
    entry = { count: 0, resetAt: nowMs + RATE_LIMIT_WINDOW_MS };
    rateLimitBuckets.set(ip, entry);
  }

  if (entry.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - nowMs) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  entry.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const accessPassword = process.env.ACCESS_PASSWORD;

  if (!accessPassword) {
    if (process.env.REQUIRE_ACCESS_PASSWORD === '1') {
      return res.status(503).json({
        success: false,
        message: 'Access password is required but not configured',
      });
    }
    return res.status(200).json({
      success: true,
      message: 'No password protection configured',
    });
  }

  const secureFlag = isSecureRequest(req) ? '; Secure' : '';

  if (req.method === 'POST') {
    if (!isSameOriginPost(req)) {
      return res.status(403).json({
        success: false,
        message: 'Cross-origin authentication request rejected',
      });
    }

    const clientIp = getClientIp(req);
    const rateCheck = consumeRateLimit(clientIp);
    if (!rateCheck.allowed) {
      res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds));
      return res.status(429).json({
        success: false,
        message: 'Too many authentication attempts, please try again later',
      });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const { password, action } = body;

    if (action === 'verify') {
      if (constantTimePasswordMatch(password, accessPassword)) {
        const sessionSecret = process.env.ACCESS_SESSION_SECRET || accessPassword;
        const token = createSessionToken(sessionSecret);
        res.setHeader('Set-Cookie', [
          `${SESSION_COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; SameSite=Strict${secureFlag}`,
        ]);

        return res.status(200).json({
          success: true,
          message: 'Authentication successful',
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Invalid password',
      });
    }
  }

  if (req.method === 'GET') {
    const query = req.query && typeof req.query === 'object' ? req.query : {};
    const { action } = query;

    if (action === 'logout') {
      res.setHeader('Set-Cookie', [
        `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict${secureFlag}`,
      ]);

      return res.status(200).json({
        success: true,
        message: 'Logged out successfully',
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
