export const ALLOWED_SYNC_SECTIONS = Object.freeze([
  'favorites',
  'history',
  'templates',
  'variables',
  'preferences',
]);

export const MAX_SYNC_BYTES = 5 * 1024 * 1024;

const FORBIDDEN_KEYS = new Set([
  'models',
  'imagemodels',
  'image_models',
  'apikey',
  'api_key',
  'secretkey',
  'secret_key',
  'privatekey',
  'private_key',
  'secretaccesskey',
  'secret_access_key',
]);

export class PayloadError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'PayloadError';
    this.statusCode = statusCode;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isForbiddenKey(key) {
  return FORBIDDEN_KEYS.has(String(key).toLowerCase());
}

export function stripForbiddenDeep(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stripForbiddenDeep(item));
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const clean = {};
  for (const [key, val] of Object.entries(value)) {
    if (isForbiddenKey(key)) continue;
    clean[key] = stripForbiddenDeep(val);
  }
  return clean;
}

/**
 * BYOK guard: only allow non-secret user sections and recursively strip any
 * model/API key fields so third-party LLM keys are never stored server-side.
 */
export function sanitizeSyncPayload(rawData) {
  if (!isPlainObject(rawData)) {
    throw new PayloadError('同步数据必须为 JSON 对象', 400);
  }

  const sanitized = {};
  for (const section of ALLOWED_SYNC_SECTIONS) {
    if (Object.prototype.hasOwnProperty.call(rawData, section) && rawData[section] !== undefined) {
      sanitized[section] = stripForbiddenDeep(rawData[section]);
    }
  }

  const json = JSON.stringify(sanitized);
  const bytes = Buffer.byteLength(json, 'utf8');
  if (bytes > MAX_SYNC_BYTES) {
    throw new PayloadError(`同步数据超过 5 MB 限制（当前 ${(bytes / 1024 / 1024).toFixed(2)} MB）`, 413);
  }

  return { data: sanitized, json, bytes };
}
