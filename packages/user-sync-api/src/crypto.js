import crypto from 'node:crypto';

export const SESSION_COOKIE_NAME = 'goprmpt_session';
const SCRYPT_KEYLEN = 64;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || typeof storedHash !== 'string') return false;
  const sep = storedHash.indexOf(':');
  if (sep <= 0) return false;
  const salt = storedHash.slice(0, sep);
  const expectedHex = storedHash.slice(sep + 1);
  if (expectedHex.length !== SCRYPT_KEYLEN * 2) return false;

  const expected = Buffer.from(expectedHex, 'hex');
  const actual = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

function hmacSign(data, secret) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

export function createSessionToken({ userId, role, tokenVersion = 1 }, secret, ttlMs) {
  const tv = Number.isInteger(tokenVersion) && tokenVersion >= 1 ? tokenVersion : 1;
  const payload = {
    uid: userId,
    role,
    tv,
    exp: Date.now() + ttlMs,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = hmacSign(encoded, secret);
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token, secret) {
  if (typeof token !== 'string' || token.length === 0) return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return null;

  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expectedSig = hmacSign(encoded, secret);

  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed.uid !== 'string' || typeof parsed.exp !== 'number') {
      return null;
    }
    if (parsed.exp <= Date.now()) return null;
    return {
      userId: parsed.uid,
      role: parsed.role || 'user',
      tokenVersion: typeof parsed.tv === 'number' ? parsed.tv : 1,
    };
  } catch {
    return null;
  }
}

export function parseCookies(header) {
  const result = {};
  if (typeof header !== 'string' || !header) return result;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(val);
      } catch {
        result[key] = val;
      }
    }
  }
  return result;
}

export function buildSessionCookie(token, { secure, maxAgeSec }) {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSec))}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function buildClearSessionCookie({ secure }) {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
