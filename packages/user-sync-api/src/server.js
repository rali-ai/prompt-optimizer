import crypto from 'node:crypto';
import http from 'node:http';
import {
  SESSION_COOKIE_NAME,
  buildClearSessionCookie,
  buildSessionCookie,
  createSessionToken,
  hashPassword,
  parseCookies,
  verifyPassword,
  verifySessionToken,
} from './crypto.js';
import {
  EMAIL_REGEX,
  USERNAME_REGEX,
  normalizeEmail,
  normalizeUsername,
  openDatabase,
  serializeUser,
} from './db.js';
import { createRateLimiter } from './rate-limit.js';
import { MAX_SYNC_BYTES, PayloadError, sanitizeSyncPayload } from './sanitize.js';
import { renderAdminHtml } from './admin-page.js';
import {
  DEFAULT_MAIL_FROM,
  maskApiKey,
  sendAnnouncementEmail,
  sendPasswordResetEmail,
  sendTestEmail,
} from './mailer.js';
import {
  isAnnouncementCurrentlyActive,
  parseCreateAnnouncementInput,
  parseCreateCommentInput,
  parseUpdateAnnouncementInput,
} from './announcements.js';
import {
  getEffectiveTier,
  getTierMeta,
  isValidTier,
  parseCreditAdjustInput,
  parseMonthlyCreditsPatch,
  tierMeetsRequirement,
} from './membership.js';
import {
  DEFAULT_QUOTA_COOLDOWN_MS,
  DEFAULT_TRANSIENT_COOLDOWN_MS,
  DOMESTIC_PRESET_MAP,
  buildFailoverCandidateChain,
  buildUpstreamChatPayload,
  classifyUpstreamFailure,
  parseCreatePlatformModelInput,
  parseUpdateModelPresetInput,
  parseUpdatePlatformModelInput,
  safeParseParamsJson,
  serializeAdminPlatformModel,
  serializePublicPlatformModel,
} from './platform-models.js';

const MAX_AUTH_BODY_BYTES = 16 * 1024;
const MAX_ADMIN_BODY_BYTES = 64 * 1024;
const MAX_AI_PROXY_BODY_BYTES = 2 * 1024 * 1024;
const MAX_SYNC_BODY_BYTES = MAX_SYNC_BYTES + 256 * 1024;
const EXTENSION_ORIGIN_REGEX = /^(chrome|moz)-extension:\/\/[a-zA-Z0-9._-]+$/;
const PUBLIC_ANNOUNCEMENT_ALLOWED_ORIGINS = new Set([
  'https://goprmpt.com',
  'https://www.goprmpt.com',
]);
const PUBLIC_ANNOUNCEMENT_COMMENTS_PATH_REGEX = /^\/user-api\/announcements\/[^/]+\/comments$/;

function getAllowedExtensionOrigin(req) {
  const origin = req.headers.origin;
  if (typeof origin !== 'string') return null;
  return EXTENSION_ORIGIN_REGEX.test(origin) ? origin : null;
}

function isExtensionClient(req) {
  if (getAllowedExtensionOrigin(req)) return true;
  const clientType = req.headers['x-client-type'];
  return typeof clientType === 'string' && clientType.trim().toLowerCase() === 'extension';
}

function applyExtensionCors(req, res) {
  const allowedOrigin = getAllowedExtensionOrigin(req);
  if (!allowedOrigin) return false;
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Client-Type');
  res.setHeader(
    'Access-Control-Expose-Headers',
    'X-GoPrmpt-Credits-Remaining, X-GoPrmpt-Credits-Cost, X-GoPrmpt-Requested-Model, X-GoPrmpt-Actual-Model, X-GoPrmpt-Failover',
  );
  res.setHeader('Access-Control-Max-Age', '86400');
  return true;
}

function applyPublicAnnouncementCors(req, res, pathname, method) {
  const isPublicAnnouncementPath =
    pathname === '/user-api/announcements/active' ||
    PUBLIC_ANNOUNCEMENT_COMMENTS_PATH_REGEX.test(pathname);
  if (!isPublicAnnouncementPath) return false;
  if (method !== 'GET' && method !== 'OPTIONS') return false;
  const origin = req.headers.origin;
  if (typeof origin !== 'string' || !PUBLIC_ANNOUNCEMENT_ALLOWED_ORIGINS.has(origin)) {
    return false;
  }
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Accept');
  res.setHeader('Access-Control-Max-Age', '86400');
  return true;
}

function decodePathParam(raw) {
  try {
    return decodeURIComponent(raw);
  } catch {
    throw new PayloadError('无效的路径参数', 400);
  }
}

function extractBearerToken(req) {
  const auth = req.headers.authorization;
  if (typeof auth !== 'string') return '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body, 'utf8'),
    ...extraHeaders,
  });
  res.end(body);
}

function sendHtml(res, statusCode, html, headOnly = false) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(html, 'utf8'),
  });
  res.end(headOnly ? undefined : html);
}

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function isSecureRequest(req, cookieSecure) {
  if (cookieSecure) return true;
  const proto = req.headers['x-forwarded-proto'];
  if (typeof proto === 'string' && proto.split(',')[0].trim().toLowerCase() === 'https') {
    return true;
  }
  return Boolean(req.socket?.encrypted);
}

function readJsonBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let settled = false;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        req.pause();
        fail(new PayloadError('请求体超过大小限制', 413));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;
      if (total === 0) {
        resolve({});
        return;
      }
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(new PayloadError('请求体必须为 JSON 对象', 400));
          return;
        }
        resolve(parsed);
      } catch {
        reject(new PayloadError('请求体不是合法的 JSON', 400));
      }
    });

    req.on('error', (err) => fail(err));
  });
}

const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function generateTemporaryPassword(length = 12) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += TEMP_PASSWORD_ALPHABET[crypto.randomInt(0, TEMP_PASSWORD_ALPHABET.length)];
  }
  return out;
}

function validateOptionalEmail(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string') {
    throw new PayloadError('邮箱格式不正确', 400);
  }
  const email = normalizeEmail(raw);
  if (!email) return null;
  if (email.length > 254 || !EMAIL_REGEX.test(email)) {
    throw new PayloadError('邮箱格式不正确，请输入有效的邮箱地址', 400);
  }
  return email;
}

function validateCredentials(body) {
  const username = normalizeUsername(body.username);
  const password = typeof body.password === 'string' ? body.password : '';
  const email = validateOptionalEmail(body.email);
  if (!USERNAME_REGEX.test(username)) {
    throw new PayloadError('用户名需为 3 到 32 位小写字母、数字、下划线、点或短横线', 400);
  }
  if (password.length < 8 || password.length > 128) {
    throw new PayloadError('密码长度需为 8 到 128 个字符', 400);
  }
  return { username, password, email };
}

const MAX_RESET_ATTEMPTS = 5;

function hashResetCode(secret, userId, email, code) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${userId}:${email}:${code}`)
    .digest('hex');
}

function timingSafeHexEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

function scrubSecretText(text, secret) {
  const str = String(text ?? '');
  if (!secret) return str;
  return str.split(secret).join('[REDACTED]');
}

async function readUpstreamErrorInfo(upstreamRes, apiKey) {
  let rawText = '';
  try {
    rawText = await upstreamRes.text();
  } catch {
    return { rawText: '', detail: `HTTP ${upstreamRes.status}` };
  }
  let detail = '';
  if (rawText) {
    try {
      const parsed = JSON.parse(rawText);
      if (typeof parsed?.error?.message === 'string' && parsed.error.message.trim()) {
        detail = parsed.error.message.trim();
      } else if (typeof parsed?.error === 'string' && parsed.error.trim()) {
        detail = parsed.error.trim();
      } else if (typeof parsed?.message === 'string' && parsed.message.trim()) {
        detail = parsed.message.trim();
      }
    } catch {
      detail = rawText.trim().slice(0, 240);
    }
  }
  const safe = scrubSecretText(detail || `HTTP ${upstreamRes.status}`, apiKey);
  return { rawText, detail: safe.slice(0, 300) };
}

async function extractUpstreamErrorDetail(upstreamRes, apiKey) {
  const { detail } = await readUpstreamErrorInfo(upstreamRes, apiKey);
  return detail;
}

function extractChatReplyPreview(json) {
  const choice = json?.choices?.[0];
  const content = choice?.message?.content ?? choice?.text ?? choice?.message?.reasoning_content ?? '';
  if (typeof content === 'string') {
    return content.trim().slice(0, 160);
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('')
      .trim()
      .slice(0, 160);
  }
  return '';
}

export function createApp(config, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const quotaCooldownMs =
    Number.isFinite(config.quotaCooldownMs) && config.quotaCooldownMs > 0
      ? config.quotaCooldownMs
      : DEFAULT_QUOTA_COOLDOWN_MS;
  const transientCooldownMs =
    Number.isFinite(config.transientCooldownMs) && config.transientCooldownMs > 0
      ? config.transientCooldownMs
      : DEFAULT_TRANSIENT_COOLDOWN_MS;
  const db = openDatabase(config.dbPath);
  if (config.adminUsername && config.adminPassword) {
    db.bootstrapAdmin({
      username: config.adminUsername,
      password: config.adminPassword,
    });
  }

  const authRateLimiter = createRateLimiter({
    max: config.rateLimitMax,
    windowMs: config.rateLimitWindowMs,
  });

  function authenticate(req) {
    let token = extractBearerToken(req);
    if (!token) {
      const cookies = parseCookies(req.headers.cookie);
      token = cookies[SESSION_COOKIE_NAME] || '';
    }
    if (!token) return null;
    const claims = verifySessionToken(token, config.secret);
    if (!claims) return null;
    const row = db.findUserById(claims.userId);
    if (!row) return null;
    return row;
  }

  function requireActiveUser(req, res) {
    const userRow = authenticate(req);
    if (!userRow) {
      sendJson(res, 401, { error: '请先登录' });
      return null;
    }
    if (userRow.disabled) {
      sendJson(res, 403, { error: '账号已被停用' });
      return null;
    }
    return userRow;
  }

  function requireAdmin(req, res) {
    const userRow = requireActiveUser(req, res);
    if (!userRow) return null;
    if (userRow.role !== 'admin') {
      sendJson(res, 403, { error: '需要管理员权限' });
      return null;
    }
    return userRow;
  }

  function checkRateLimit(req, res) {
    const ip = getClientIp(req);
    const result = authRateLimiter.consume(ip);
    if (!result.allowed) {
      sendJson(
        res,
        429,
        { error: '请求过于频繁，请稍后再试' },
        { 'Retry-After': String(result.retryAfterSec) },
      );
      return false;
    }
    return true;
  }

  function issueSession(req, userRow) {
    const token = createSessionToken(
      { userId: userRow.id, role: userRow.role },
      config.secret,
      config.sessionTtlMs,
    );
    const cookie = buildSessionCookie(token, {
      secure: isSecureRequest(req, config.cookieSecure),
      maxAgeSec: config.sessionTtlMs / 1000,
    });
    return { token, cookie };
  }

  function isMembershipEnabled() {
    return db.getMembershipEnabled(Boolean(config.membershipEnabled));
  }

  function resolveMailConfig() {
    const settings = db.getMailSettings({
      resendApiKey: config.resendApiKey,
      mailFrom: config.mailFrom || DEFAULT_MAIL_FROM,
    });
    const from = settings.from || DEFAULT_MAIL_FROM;
    return {
      apiKey: settings.apiKey,
      from,
      source: settings.source,
      enabled: Boolean(settings.apiKey && from),
    };
  }

  function buildAdminSettingsPayload() {
    const mail = resolveMailConfig();
    return {
      membershipEnabled: isMembershipEnabled(),
      monthlyCredits: db.getMonthlyCredits(),
      emailResetEnabled: mail.enabled,
      resendConfigured: mail.enabled,
      resendKeyHint: maskApiKey(mail.apiKey),
      mailFrom: mail.from,
      mailSource: mail.source,
    };
  }

  async function handleRequest(req, res) {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = url.pathname;
    const method = (req.method || 'GET').toUpperCase();

    applyPublicAnnouncementCors(req, res, pathname, method);

    if (method === 'OPTIONS' && pathname.startsWith('/user-api/')) {
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      res.end();
      return;
    }

    if (method === 'GET' && pathname === '/user-api/healthz') {
      return sendJson(res, 200, { ok: true });
    }

    if (method === 'GET' && pathname === '/user-api/announcements/active') {
      return sendJson(res, 200, { announcements: db.listActiveAnnouncements() });
    }

    const announcementCommentsMatch = pathname.match(
      /^\/user-api\/announcements\/([^/]+)\/comments$/,
    );
    if (method === 'GET' && announcementCommentsMatch) {
      const id = decodePathParam(announcementCommentsMatch[1]);
      const announcement = db.findAnnouncementById(id);
      const userRow = authenticate(req);
      const isAdminCaller = Boolean(userRow && !userRow.disabled && userRow.role === 'admin');
      if (!announcement || (!isAdminCaller && !isAnnouncementCurrentlyActive(announcement))) {
        return sendJson(res, 404, { error: '公告不存在或已下线' });
      }
      const rawLimit = url.searchParams.get('limit');
      let limit = 50;
      if (rawLimit !== null && rawLimit.trim() !== '') {
        const parsed = Number.parseInt(rawLimit, 10);
        if (Number.isFinite(parsed)) {
          limit = Math.min(100, Math.max(1, parsed));
        }
      }
      return sendJson(res, 200, {
        comments: db.listAnnouncementComments(id, limit),
        commentCount: db.countAnnouncementComments(id),
      });
    }

    if (method === 'POST' && announcementCommentsMatch) {
      if (!checkRateLimit(req, res)) return;
      const userRow = authenticate(req);
      if (!userRow) {
        return sendJson(res, 401, { error: '请先注册并登录会员账号后再发表评论' });
      }
      if (userRow.disabled) {
        return sendJson(res, 403, { error: '账号已被停用' });
      }
      const id = decodePathParam(announcementCommentsMatch[1]);
      const announcement = db.findAnnouncementById(id);
      if (!announcement || !isAnnouncementCurrentlyActive(announcement)) {
        return sendJson(res, 404, { error: '公告不存在或已下线' });
      }
      const body = await readJsonBody(req, MAX_AUTH_BODY_BYTES);
      const { content } = parseCreateCommentInput(body);
      const comment = db.createAnnouncementComment({
        announcementId: id,
        userId: userRow.id,
        content,
      });
      return sendJson(res, 201, {
        comment,
        commentCount: db.countAnnouncementComments(id),
      });
    }

    const announcementCommentItemMatch = pathname.match(
      /^\/user-api\/announcements\/([^/]+)\/comments\/([^/]+)$/,
    );
    if (method === 'DELETE' && announcementCommentItemMatch) {
      const userRow = requireActiveUser(req, res);
      if (!userRow) return;
      const id = decodePathParam(announcementCommentItemMatch[1]);
      const commentId = decodePathParam(announcementCommentItemMatch[2]);
      const comment = db.findAnnouncementCommentById(commentId);
      if (!comment || comment.announcement_id !== id) {
        return sendJson(res, 404, { error: '评论不存在' });
      }
      if (userRow.role !== 'admin' && comment.user_id !== userRow.id) {
        return sendJson(res, 403, { error: '仅可删除自己的评论或需管理员权限' });
      }
      db.deleteAnnouncementComment(commentId);
      return sendJson(res, 200, {
        ok: true,
        commentCount: db.countAnnouncementComments(id),
      });
    }

    if (method === 'GET' && pathname === '/user-api/config') {
      const mail = resolveMailConfig();
      return sendJson(res, 200, {
        membershipEnabled: isMembershipEnabled(),
        registrationEnabled: true,
        emailResetEnabled: mail.enabled,
        monthlyCredits: db.getMonthlyCredits(),
      });
    }

    if (method === 'GET' && pathname === '/user-api/model-presets') {
      return sendJson(res, 200, { presets: db.listModelPresets() });
    }

    if (method === 'GET' && pathname === '/user-api/platform-models') {
      const userRow = authenticate(req);
      const now = Date.now();
      const rows = db.listPlatformModelsRaw({ enabledOnly: true });
      return sendJson(res, 200, {
        models: rows.map((row) => serializePublicPlatformModel(row, userRow, now)),
      });
    }

    if (method === 'GET' && pathname === '/user-api/credits') {
      const userRow = requireActiveUser(req, res);
      if (!userRow) return;
      const now = Date.now();
      const granted = db.ensureMonthlyCreditGrant(userRow.id, now);
      const freshUser = granted?.user || userRow;
      const effectiveTier = getEffectiveTier(freshUser, now);
      const monthlyCredits = granted?.monthlyCredits || db.getMonthlyCredits();
      const currentMonth = granted?.currentMonth;
      const grantedThisMonth =
        freshUser.last_credit_grant_month === currentMonth
          ? Number(freshUser.last_credit_grant_amount || 0)
          : 0;
      const ledger = db.listUserCreditLedger(freshUser.id, 20);
      return sendJson(res, 200, {
        balance: Number(freshUser.credit_balance || 0),
        tier: freshUser.tier,
        effectiveTier,
        tierExpiresAt: freshUser.tier_expires_at ?? null,
        monthlyAllowance: Number(monthlyCredits[effectiveTier] || 0),
        currentMonth,
        grantedThisMonth,
        monthlyCredits,
        ledger,
      });
    }

    if (method === 'GET' && pathname === '/user-api/ai/v1/models') {
      const userRow = requireActiveUser(req, res);
      if (!userRow) return;
      const now = Date.now();
      const accessible = db
        .listPlatformModelsRaw({ enabledOnly: true })
        .filter((row) => tierMeetsRequirement(userRow, row.min_tier, now));
      return sendJson(res, 200, {
        object: 'list',
        data: accessible.map((row) => ({
          id: row.id,
          object: 'model',
          created: Math.floor(Number(row.created_at || 0) / 1000),
          owned_by: row.provider_label,
        })),
      });
    }

    if (method === 'POST' && pathname === '/user-api/ai/v1/chat/completions') {
      const userRow = requireActiveUser(req, res);
      if (!userRow) return;
      const body = await readJsonBody(req, MAX_AI_PROXY_BODY_BYTES);
      const modelId = typeof body.model === 'string' ? body.model.trim() : '';
      if (!modelId) {
        return sendJson(res, 400, { error: '请指定平台模型 ID' });
      }
      const primaryModel = db.findPlatformModelRawById(modelId);
      if (!primaryModel || !primaryModel.enabled) {
        return sendJson(res, 404, { error: '平台模型不存在或已停用' });
      }
      const now = Date.now();
      if (!tierMeetsRequirement(userRow, primaryModel.min_tier, now)) {
        const reqMeta = getTierMeta(primaryModel.min_tier);
        return sendJson(res, 403, {
          error: `该模型需要「${reqMeta.label}」及以上会员才能使用`,
          requiredTier: primaryModel.min_tier,
          effectiveTier: getEffectiveTier(userRow, now),
        });
      }

      const creditCost = Number(primaryModel.credit_cost || 0);
      const debit = db.debitUserCreditsAtomic(userRow.id, creditCost, {
        modelId: primaryModel.id,
        note: `调用 ${primaryModel.name}`,
        now,
      });
      if (!debit.ok) {
        if (debit.reason === 'disabled') {
          return sendJson(res, 403, { error: '账号已被停用' });
        }
        return sendJson(res, 402, {
          error: `网站积分不足：本次调用需要 ${debit.required} 积分，当前剩余 ${debit.balance} 积分`,
          balance: debit.balance,
          required: debit.required,
        });
      }

      let refunded = false;
      const refundIfNeeded = (reasonNote) => {
        if (refunded || debit.cost <= 0) return;
        refunded = true;
        try {
          db.refundUserCredits(userRow.id, debit.cost, {
            modelId: primaryModel.id,
            note: reasonNote || `调用 ${primaryModel.name} 失败自动退回`,
          });
        } catch (refundErr) {
          console.error('[user-sync-api] credit refund failed:', refundErr);
        }
      };

      const candidates = buildFailoverCandidateChain(
        primaryModel,
        db.listPlatformModelsRaw({ enabledOnly: true }),
        userRow,
        { now },
      );

      const attemptedModels = [];
      let lastErrorStatus = 502;
      let lastErrorMessage = '上游模型服务暂时不可用';
      let lastRefundNote = `调用 ${primaryModel.name} 失败自动退回`;
      const allowFailover = primaryModel.auto_fallback !== 0 && primaryModel.auto_fallback !== false;

      for (const candidate of candidates) {
        attemptedModels.push(candidate.id);
        const upstreamUrl = `${candidate.base_url.replace(/\/+$/, '')}/chat/completions`;
        const upstreamPayload = buildUpstreamChatPayload(candidate, body);

        let upstreamRes;
        try {
          upstreamRes = await fetchImpl(upstreamUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${candidate.api_key}`,
            },
            body: JSON.stringify(upstreamPayload),
          });
        } catch (err) {
          const attemptNow = Date.now();
          db.recordPlatformModelFailure(candidate.id, {
            cooldownUntil: attemptNow + transientCooldownMs,
            reason: '上游连接异常',
            now: attemptNow,
          });
          const msg = scrubSecretText(
            err instanceof Error ? err.message : String(err),
            candidate.api_key,
          );
          lastErrorStatus = 502;
          lastErrorMessage = `上游模型服务连接失败：${msg}`;
          lastRefundNote = `调用 ${primaryModel.name} 上游连接失败自动退回`;
          if (!allowFailover) break;
          continue;
        }

        if (!upstreamRes.ok) {
          const { rawText, detail } = await readUpstreamErrorInfo(upstreamRes, candidate.api_key);
          const classification = classifyUpstreamFailure(upstreamRes.status, rawText || detail);
          lastErrorStatus =
            upstreamRes.status >= 400 && upstreamRes.status <= 599 ? upstreamRes.status : 502;
          lastErrorMessage = `上游模型调用失败：${detail}`;
          lastRefundNote = `调用 ${primaryModel.name} 上游返回 ${upstreamRes.status} 自动退回`;

          if (classification.retryable) {
            const attemptNow = Date.now();
            const cooldownMs =
              classification.kind === 'quota_exhausted' ? quotaCooldownMs : transientCooldownMs;
            db.recordPlatformModelFailure(candidate.id, {
              cooldownUntil: attemptNow + cooldownMs,
              reason: classification.reason,
              now: attemptNow,
            });
            if (!allowFailover) break;
            continue;
          }
          break;
        }

        const upstreamContentType = upstreamRes.headers.get('content-type') || '';
        const isStreaming =
          body.stream === true || upstreamContentType.toLowerCase().includes('text/event-stream');

        let responseText = null;
        if (!isStreaming) {
          try {
            responseText = await upstreamRes.text();
          } catch (readErr) {
            const attemptNow = Date.now();
            db.recordPlatformModelFailure(candidate.id, {
              cooldownUntil: attemptNow + transientCooldownMs,
              reason: '上游响应读取异常',
              now: attemptNow,
            });
            const msg = scrubSecretText(
              readErr instanceof Error ? readErr.message : String(readErr),
              candidate.api_key,
            );
            lastErrorStatus = 502;
            lastErrorMessage = `上游模型响应读取失败：${msg}`;
            lastRefundNote = `调用 ${primaryModel.name} 读取响应失败自动退回`;
            if (!allowFailover) break;
            continue;
          }
        }

        if (candidate.cooldown_until || candidate.last_error_reason) {
          db.clearPlatformModelCooldown(candidate.id);
        }

        const failedOver = candidate.id !== primaryModel.id;
        if (failedOver && debit.ledgerId) {
          db.updateCreditLedgerNote(
            debit.ledgerId,
            `调用 ${primaryModel.name}（自动切替至 ${candidate.name}）`,
          );
        }

        const responseHeaders = {
          'X-GoPrmpt-Credits-Remaining': String(debit.balanceAfter),
          'X-GoPrmpt-Credits-Cost': String(debit.cost),
          'X-GoPrmpt-Requested-Model': primaryModel.id,
          'X-GoPrmpt-Actual-Model': candidate.id,
        };
        if (failedOver) {
          responseHeaders['X-GoPrmpt-Failover'] = '1';
        }

        if (isStreaming) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            ...responseHeaders,
          });
          if (upstreamRes.body && typeof upstreamRes.body.getReader === 'function') {
            const reader = upstreamRes.body.getReader();
            const onClose = () => {
              reader.cancel().catch(() => {});
            };
            req.on('close', onClose);
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value && value.length > 0 && !res.writableEnded) {
                  res.write(Buffer.from(value));
                }
              }
            } catch (streamErr) {
              console.error('[user-sync-api] stream proxy interrupted:', streamErr?.message || streamErr);
            } finally {
              req.off('close', onClose);
              if (!res.writableEnded) {
                res.end();
              }
            }
            return;
          }
          const text = await upstreamRes.text();
          res.end(text);
          return;
        }

        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'Content-Length': Buffer.byteLength(responseText, 'utf8'),
          ...responseHeaders,
        });
        res.end(responseText);
        return;
      }

      refundIfNeeded(lastRefundNote);
      return sendJson(res, lastErrorStatus, {
        error: lastErrorMessage,
        attemptedModels,
      });
    }

    if (method === 'POST' && pathname === '/user-api/register') {
      if (!checkRateLimit(req, res)) return;
      const body = await readJsonBody(req, MAX_AUTH_BODY_BYTES);
      const { username, password, email } = validateCredentials(body);

      if (db.findUserByUsername(username)) {
        return sendJson(res, 409, { error: '用户名已被注册' });
      }
      if (email && db.findUserByEmail(email)) {
        return sendJson(res, 409, { error: '该邮箱已被其他账号使用' });
      }

      let userRow;
      try {
        userRow = db.createUser({
          username,
          email,
          passwordHash: hashPassword(password),
          role: 'user',
        });
      } catch (err) {
        const msg = String(err?.message || '');
        if (msg.includes('UNIQUE')) {
          if (msg.includes('email')) {
            return sendJson(res, 409, { error: '该邮箱已被其他账号使用' });
          }
          return sendJson(res, 409, { error: '用户名已被注册' });
        }
        throw err;
      }

      const granted = db.ensureMonthlyCreditGrant(userRow.id);
      userRow = granted?.user || userRow;

      const { token, cookie } = issueSession(req, userRow);
      const payload = { user: serializeUser(userRow) };
      if (isExtensionClient(req)) payload.token = token;
      return sendJson(res, 201, payload, { 'Set-Cookie': cookie });
    }

    if (method === 'POST' && pathname === '/user-api/login') {
      if (!checkRateLimit(req, res)) return;
      const body = await readJsonBody(req, MAX_AUTH_BODY_BYTES);
      const identifier = normalizeUsername(body.username);
      const password = typeof body.password === 'string' ? body.password : '';
      if (!identifier || !password) {
        return sendJson(res, 400, { error: '请输入用户名和密码' });
      }

      let userRow = identifier.includes('@')
        ? db.findUserByEmail(identifier)
        : db.findUserByUsername(identifier);
      if (!userRow || !verifyPassword(password, userRow.password_hash)) {
        return sendJson(res, 401, { error: '用户名或密码错误' });
      }
      if (userRow.disabled) {
        return sendJson(res, 403, { error: '账号已被停用' });
      }

      const granted = db.ensureMonthlyCreditGrant(userRow.id);
      userRow = granted?.user || userRow;

      const { token, cookie } = issueSession(req, userRow);
      const payload = { user: serializeUser(userRow) };
      if (isExtensionClient(req)) payload.token = token;
      return sendJson(res, 200, payload, { 'Set-Cookie': cookie });
    }

    if (method === 'POST' && pathname === '/user-api/logout') {
      const clearCookie = buildClearSessionCookie({
        secure: isSecureRequest(req, config.cookieSecure),
      });
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearCookie });
    }

    if (method === 'POST' && pathname === '/user-api/password-reset/request') {
      if (!checkRateLimit(req, res)) return;
      const mail = resolveMailConfig();
      if (!mail.enabled) {
        return sendJson(res, 503, { error: '暂未配置邮件发信服务，请联系管理员重置密码' });
      }
      const body = await readJsonBody(req, MAX_AUTH_BODY_BYTES);
      const email = validateOptionalEmail(body.email);
      if (!email) {
        throw new PayloadError('请输入有效的绑定邮箱地址', 400);
      }

      const genericMessage = '如果该邮箱已绑定账号，6 位验证码已发送，请查收邮件（含垃圾箱）';
      const userRow = db.findUserByEmail(email);
      if (!userRow || userRow.disabled) {
        return sendJson(res, 200, { ok: true, message: genericMessage });
      }

      const now = Date.now();
      const cooldownMs = config.passwordResetCooldownMs || 60 * 1000;
      const recent = db.getLatestActiveResetCode(email, now);
      if (recent && now - recent.created_at < cooldownMs) {
        const waitSec = Math.max(1, Math.ceil((cooldownMs - (now - recent.created_at)) / 1000));
        return sendJson(
          res,
          429,
          { error: `发送过于频繁，请 ${waitSec} 秒后再试` },
          { 'Retry-After': String(waitSec) },
        );
      }

      const code = String(crypto.randomInt(100000, 1000000));
      const ttlMs = config.passwordResetTtlMs || 15 * 60 * 1000;
      const expiresMinutes = Math.max(1, Math.round(ttlMs / 60000));
      try {
        await sendPasswordResetEmail({
          apiKey: mail.apiKey,
          from: mail.from,
          to: email,
          username: userRow.username,
          code,
          expiresMinutes,
          fetchImpl,
        });
      } catch (err) {
        console.error('[user-sync-api] password reset email failed:', err?.message || err);
        return sendJson(res, 502, {
          error: '验证码邮件发送失败，请稍后重试或联系管理员检查发信配置',
        });
      }

      db.createPasswordResetCode({
        userId: userRow.id,
        email,
        codeHash: hashResetCode(config.secret, userRow.id, email, code),
        ttlMs,
      });

      return sendJson(res, 200, { ok: true, message: genericMessage });
    }

    if (method === 'POST' && pathname === '/user-api/password-reset/confirm') {
      if (!checkRateLimit(req, res)) return;
      const mail = resolveMailConfig();
      if (!mail.enabled) {
        return sendJson(res, 503, { error: '暂未配置邮件发信服务，请联系管理员重置密码' });
      }
      const body = await readJsonBody(req, MAX_AUTH_BODY_BYTES);
      const email = validateOptionalEmail(body.email);
      const code = typeof body.code === 'string' ? body.code.trim() : '';
      const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
      if (!email) {
        throw new PayloadError('请输入有效的绑定邮箱地址', 400);
      }
      if (!/^\d{6}$/.test(code)) {
        throw new PayloadError('请输入 6 位数字验证码', 400);
      }
      if (newPassword.length < 8 || newPassword.length > 128) {
        throw new PayloadError('新密码长度需为 8 到 128 个字符', 400);
      }

      const record = db.getLatestActiveResetCode(email, Date.now());
      if (!record || record.attempts >= MAX_RESET_ATTEMPTS) {
        return sendJson(res, 400, { error: '验证码无效、已过期或错误次数过多，请重新获取' });
      }

      const expectedHash = hashResetCode(config.secret, record.user_id, email, code);
      if (!timingSafeHexEqual(record.code_hash, expectedHash)) {
        db.incrementResetCodeAttempts(record.id);
        return sendJson(res, 400, { error: '验证码不正确，请检查后重试' });
      }

      const userRow = db.findUserById(record.user_id);
      if (!userRow) {
        return sendJson(res, 404, { error: '账号不存在' });
      }
      if (userRow.disabled) {
        return sendJson(res, 403, { error: '账号已被停用' });
      }

      db.updateUserPassword(userRow.id, hashPassword(newPassword));
      db.markResetCodesUsed(userRow.id);
      return sendJson(res, 200, { ok: true, message: '密码已重置，请使用新密码登录' });
    }

    if (method === 'GET' && pathname === '/user-api/me') {
      const userRow = requireActiveUser(req, res);
      if (!userRow) return;
      const granted = db.ensureMonthlyCreditGrant(userRow.id);
      const freshUser = granted?.user || userRow;
      return sendJson(res, 200, { user: serializeUser(freshUser) });
    }

    if (method === 'PATCH' && pathname === '/user-api/me/profile') {
      const userRow = requireActiveUser(req, res);
      if (!userRow) return;
      const body = await readJsonBody(req, MAX_AUTH_BODY_BYTES);
      if (!('email' in body)) {
        throw new PayloadError('请提供要更新的邮箱字段', 400);
      }
      const email = validateOptionalEmail(body.email);
      if (email) {
        const owner = db.findUserByEmail(email);
        if (owner && owner.id !== userRow.id) {
          return sendJson(res, 409, { error: '该邮箱已被其他账号使用' });
        }
      }
      let updated;
      try {
        updated = db.updateUserEmail(userRow.id, email);
      } catch (err) {
        if (String(err?.message || '').includes('UNIQUE')) {
          return sendJson(res, 409, { error: '该邮箱已被其他账号使用' });
        }
        throw err;
      }
      return sendJson(res, 200, { user: serializeUser(updated) });
    }

    if (method === 'POST' && pathname === '/user-api/me/password') {
      if (!checkRateLimit(req, res)) return;
      const userRow = requireActiveUser(req, res);
      if (!userRow) return;
      const body = await readJsonBody(req, MAX_AUTH_BODY_BYTES);
      const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
      const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
      if (!currentPassword || !newPassword) {
        throw new PayloadError('请输入当前密码和新密码', 400);
      }
      if (!verifyPassword(currentPassword, userRow.password_hash)) {
        return sendJson(res, 401, { error: '当前密码不正确' });
      }
      if (newPassword.length < 8 || newPassword.length > 128) {
        throw new PayloadError('新密码长度需为 8 到 128 个字符', 400);
      }
      const updated = db.updateUserPassword(userRow.id, hashPassword(newPassword));
      const { token, cookie } = issueSession(req, updated);
      const payload = { ok: true, user: serializeUser(updated) };
      if (isExtensionClient(req)) payload.token = token;
      return sendJson(res, 200, payload, { 'Set-Cookie': cookie });
    }

    if (method === 'GET' && pathname === '/user-api/sync') {
      const userRow = requireActiveUser(req, res);
      if (!userRow) return;
      const blob = db.getSyncBlob(userRow.id);
      return sendJson(res, 200, blob);
    }

    if (method === 'PUT' && pathname === '/user-api/sync') {
      const userRow = requireActiveUser(req, res);
      if (!userRow) return;
      const body = await readJsonBody(req, MAX_SYNC_BODY_BYTES);
      if (body.expectedVersion !== undefined && body.expectedVersion !== null) {
        if (!Number.isInteger(body.expectedVersion) || body.expectedVersion < 0) {
          throw new PayloadError('expectedVersion 必须为非负整数', 400);
        }
      }
      const { json, bytes } = sanitizeSyncPayload(body.data);
      const result = db.putSyncBlob(userRow.id, {
        json,
        bytes,
        expectedVersion: body.expectedVersion,
      });
      if (result.conflict) {
        return sendJson(res, 409, {
          error: '云端已有更新版本，请先拉取最新数据后再同步',
          currentVersion: result.currentVersion,
        });
      }
      return sendJson(res, 200, {
        version: result.version,
        updatedAt: result.updatedAt,
        bytes: result.bytes,
      });
    }

    if (
      (method === 'GET' || method === 'HEAD') &&
      (pathname === '/user-api/admin' || pathname === '/user-api/admin/')
    ) {
      const userRow = authenticate(req);
      const authenticated = Boolean(userRow && !userRow.disabled);
      const isAdmin = Boolean(authenticated && userRow.role === 'admin');
      const settings = buildAdminSettingsPayload();
      const html = renderAdminHtml({
        authenticated,
        isAdmin,
        username: userRow?.username || '',
        membershipEnabled: settings.membershipEnabled,
        monthlyCredits: settings.monthlyCredits,
        emailResetEnabled: settings.emailResetEnabled,
        resendKeyHint: settings.resendKeyHint,
        mailFrom: settings.mailFrom,
      });
      return sendHtml(res, 200, html, method === 'HEAD');
    }

    if (method === 'GET' && pathname === '/user-api/admin/settings') {
      const adminRow = requireAdmin(req, res);
      if (!adminRow) return;
      return sendJson(res, 200, buildAdminSettingsPayload());
    }

    if (method === 'PATCH' && pathname === '/user-api/admin/settings') {
      const adminRow = requireAdmin(req, res);
      if (!adminRow) return;
      const body = await readJsonBody(req, MAX_AUTH_BODY_BYTES);
      let touched = false;

      if (body.membershipEnabled !== undefined) {
        if (typeof body.membershipEnabled !== 'boolean') {
          throw new PayloadError('membershipEnabled 必须为布尔值', 400);
        }
        db.setMembershipEnabled(body.membershipEnabled);
        touched = true;
      }

      if (body.monthlyCredits !== undefined) {
        const creditsPatch = parseMonthlyCreditsPatch(body.monthlyCredits);
        db.setMonthlyCredits(creditsPatch);
        db.ensureMonthlyCreditGrantsForAllActive();
        touched = true;
      }

      const mailPatch = {};
      if (body.resendApiKey !== undefined) {
        if (typeof body.resendApiKey !== 'string') {
          throw new PayloadError('resendApiKey 必须为字符串', 400);
        }
        const trimmedKey = body.resendApiKey.trim();
        if (trimmedKey && trimmedKey.length > 256) {
          throw new PayloadError('resendApiKey 长度无效', 400);
        }
        mailPatch.apiKey = trimmedKey;
        touched = true;
      }

      if (body.mailFrom !== undefined) {
        if (typeof body.mailFrom !== 'string') {
          throw new PayloadError('mailFrom 必须为字符串', 400);
        }
        const trimmedFrom = body.mailFrom.trim();
        if (trimmedFrom.length > 256) {
          throw new PayloadError('发件人地址过长', 400);
        }
        mailPatch.from = trimmedFrom;
        touched = true;
      }

      if (!touched) {
        throw new PayloadError('请提供至少一个可更新的设置字段', 400);
      }

      if (mailPatch.apiKey !== undefined || mailPatch.from !== undefined) {
        db.saveMailSettings(mailPatch);
      }

      return sendJson(res, 200, buildAdminSettingsPayload());
    }

    if (method === 'POST' && pathname === '/user-api/admin/test-email') {
      const adminRow = requireAdmin(req, res);
      if (!adminRow) return;
      const mail = resolveMailConfig();
      if (!mail.enabled) {
        return sendJson(res, 400, { error: '请先配置并保存 Resend API Key 与发件人地址' });
      }
      const body = await readJsonBody(req, MAX_AUTH_BODY_BYTES);
      const to = validateOptionalEmail(body.to);
      if (!to) {
        throw new PayloadError('请输入有效的测试收件邮箱地址', 400);
      }
      try {
        const sent = await sendTestEmail({
          apiKey: mail.apiKey,
          from: mail.from,
          to,
          fetchImpl,
        });
        return sendJson(res, 200, { ok: true, id: sent.id, to });
      } catch (err) {
        return sendJson(res, 502, {
          error: err instanceof Error ? err.message : '测试邮件发送失败',
        });
      }
    }

    if (method === 'GET' && pathname === '/user-api/admin/users') {
      const adminRow = requireAdmin(req, res);
      if (!adminRow) return;
      db.ensureMonthlyCreditGrantsForAllActive();
      return sendJson(res, 200, {
        ...buildAdminSettingsPayload(),
        users: db.listUsersWithSync(),
      });
    }

    const adminResetPwdMatch = pathname.match(/^\/user-api\/admin\/users\/([^/]+)\/reset-password$/);
    if (method === 'POST' && adminResetPwdMatch) {
      const adminRow = requireAdmin(req, res);
      if (!adminRow) return;
      const targetId = decodePathParam(adminResetPwdMatch[1]);
      if (targetId === adminRow.id) {
        return sendJson(res, 400, { error: '请使用「修改管理员密码」更改当前管理员密码' });
      }
      const targetRow = db.findUserById(targetId);
      if (!targetRow) {
        return sendJson(res, 404, { error: '用户不存在' });
      }
      const body = await readJsonBody(req, MAX_AUTH_BODY_BYTES);
      let tempPassword;
      if (body.password !== undefined) {
        if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) {
          throw new PayloadError('密码长度需为 8 到 128 个字符', 400);
        }
        tempPassword = body.password;
      } else {
        tempPassword = generateTemporaryPassword(12);
      }
      const updated = db.updateUserPassword(targetId, hashPassword(tempPassword));
      return sendJson(res, 200, {
        user: serializeUser(updated),
        temporaryPassword: tempPassword,
      });
    }

    const adminUserCreditsMatch = pathname.match(/^\/user-api\/admin\/users\/([^/]+)\/credits$/);
    if (method === 'POST' && adminUserCreditsMatch) {
      const adminRow = requireAdmin(req, res);
      if (!adminRow) return;
      const targetId = decodePathParam(adminUserCreditsMatch[1]);
      const body = await readJsonBody(req, MAX_AUTH_BODY_BYTES);
      const { delta, note } = parseCreditAdjustInput(body);
      const result = db.adjustUserCredits(targetId, delta, note);
      if (!result.found) {
        return sendJson(res, 404, { error: '用户不存在' });
      }
      if (result.insufficient) {
        return sendJson(res, 400, {
          error: `积分余额不能为负数（当前余额 ${result.balance}，调整值 ${delta}）`,
        });
      }
      return sendJson(res, 200, {
        user: serializeUser(result.user),
        creditBalance: result.creditBalance,
      });
    }

    const adminUserMatch = pathname.match(/^\/user-api\/admin\/users\/([^/]+)$/);
    if (method === 'PATCH' && adminUserMatch) {
      const adminRow = requireAdmin(req, res);
      if (!adminRow) return;
      const targetId = decodePathParam(adminUserMatch[1]);
      const body = await readJsonBody(req, MAX_AUTH_BODY_BYTES);

      const patch = {};
      if (body.tier !== undefined) {
        if (!isValidTier(body.tier)) {
          throw new PayloadError('tier 仅支持 free、standard、pro 或 internal', 400);
        }
        patch.tier = body.tier;
      }
      if (body.tierExpiresAt !== undefined) {
        if (
          body.tierExpiresAt !== null &&
          (!Number.isInteger(body.tierExpiresAt) || body.tierExpiresAt < 0)
        ) {
          throw new PayloadError('tierExpiresAt 必须为毫秒时间戳整数或 null', 400);
        }
        patch.tierExpiresAt = body.tierExpiresAt;
      }
      if (body.disabled !== undefined) {
        if (typeof body.disabled !== 'boolean') {
          throw new PayloadError('disabled 必须为布尔值', 400);
        }
        patch.disabled = body.disabled;
      }

      const updated = db.updateUserAdmin(targetId, patch);
      if (!updated) {
        return sendJson(res, 404, { error: '用户不存在' });
      }
      let freshUser = updated;
      if (
        !updated.disabled &&
        (patch.tier !== undefined || patch.tierExpiresAt !== undefined || patch.disabled === false)
      ) {
        const granted = db.ensureMonthlyCreditGrant(updated.id);
        if (granted?.user) freshUser = granted.user;
      }
      return sendJson(res, 200, { user: serializeUser(freshUser) });
    }

    if (method === 'GET' && pathname === '/user-api/admin/platform-models') {
      const adminRow = requireAdmin(req, res);
      if (!adminRow) return;
      const now = Date.now();
      const models = db.listPlatformModelsRaw().map((row) => serializeAdminPlatformModel(row, now));
      return sendJson(res, 200, { models });
    }

    if (method === 'POST' && pathname === '/user-api/admin/platform-models') {
      const adminRow = requireAdmin(req, res);
      if (!adminRow) return;
      const body = await readJsonBody(req, MAX_ADMIN_BODY_BYTES);
      const input = parseCreatePlatformModelInput(body);
      const model = db.createPlatformModel(input);
      return sendJson(res, 201, { model });
    }

    const adminPlatformModelClearCooldownMatch = pathname.match(
      /^\/user-api\/admin\/platform-models\/([^/]+)\/clear-cooldown$/,
    );
    if (method === 'POST' && adminPlatformModelClearCooldownMatch) {
      const adminRow = requireAdmin(req, res);
      if (!adminRow) return;
      const id = decodePathParam(adminPlatformModelClearCooldownMatch[1]);
      const updated = db.clearPlatformModelCooldown(id);
      if (!updated) {
        return sendJson(res, 404, { error: '平台模型不存在' });
      }
      return sendJson(res, 200, { model: serializeAdminPlatformModel(updated) });
    }

    const adminPlatformModelTestMatch = pathname.match(
      /^\/user-api\/admin\/platform-models\/([^/]+)\/test$/,
    );
    if (method === 'POST' && adminPlatformModelTestMatch) {
      const adminRow = requireAdmin(req, res);
      if (!adminRow) return;
      const id = decodePathParam(adminPlatformModelTestMatch[1]);
      const row = db.findPlatformModelRawById(id);
      if (!row) {
        return sendJson(res, 404, { error: '平台模型不存在' });
      }

      const defaultParams = safeParseParamsJson(row.default_params_json);
      const testPayload = {
        ...defaultParams,
        model: row.upstream_model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 16,
        stream: false,
      };
      const endpoint = `${row.base_url.replace(/\/+$/, '')}/chat/completions`;
      const startedAt = Date.now();
      let upstreamRes;
      try {
        upstreamRes = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${row.api_key}`,
          },
          body: JSON.stringify(testPayload),
        });
      } catch (err) {
        const msg = scrubSecretText(
          err instanceof Error ? err.message : String(err),
          row.api_key,
        );
        return sendJson(res, 502, { error: `连通性测试失败：${msg}` });
      }

      if (!upstreamRes.ok) {
        const detail = await extractUpstreamErrorDetail(upstreamRes, row.api_key);
        return sendJson(res, 502, {
          error: `上游返回 HTTP ${upstreamRes.status}：${detail}`,
        });
      }

      const clearedRow = db.clearPlatformModelCooldown(id);
      const latencyMs = Math.max(0, Date.now() - startedAt);
      const json = await upstreamRes.json().catch(() => null);
      const replyPreview = extractChatReplyPreview(json);
      return sendJson(res, 200, {
        ok: true,
        latencyMs,
        replyPreview,
        upstreamModel: row.upstream_model,
        model: clearedRow ? serializeAdminPlatformModel(clearedRow) : undefined,
      });
    }

    const adminPlatformModelMatch = pathname.match(/^\/user-api\/admin\/platform-models\/([^/]+)$/);
    if (method === 'PATCH' && adminPlatformModelMatch) {
      const adminRow = requireAdmin(req, res);
      if (!adminRow) return;
      const id = decodePathParam(adminPlatformModelMatch[1]);
      const body = await readJsonBody(req, MAX_ADMIN_BODY_BYTES);
      const patch = parseUpdatePlatformModelInput(body, id);
      const updated = db.updatePlatformModel(id, patch);
      if (!updated) {
        return sendJson(res, 404, { error: '平台模型不存在' });
      }
      return sendJson(res, 200, { model: updated });
    }

    if (method === 'DELETE' && adminPlatformModelMatch) {
      const adminRow = requireAdmin(req, res);
      if (!adminRow) return;
      const id = decodePathParam(adminPlatformModelMatch[1]);
      const deleted = db.deletePlatformModel(id);
      if (!deleted) {
        return sendJson(res, 404, { error: '平台模型不存在' });
      }
      return sendJson(res, 200, { ok: true });
    }

    if (method === 'GET' && pathname === '/user-api/admin/model-presets') {
      const adminRow = requireAdmin(req, res);
      if (!adminRow) return;
      return sendJson(res, 200, { presets: db.listModelPresets() });
    }

    const adminModelPresetMatch = pathname.match(/^\/user-api\/admin\/model-presets\/([^/]+)$/);
    if (method === 'PATCH' && adminModelPresetMatch) {
      const adminRow = requireAdmin(req, res);
      if (!adminRow) return;
      const providerId = decodePathParam(adminModelPresetMatch[1]);
      if (!Object.prototype.hasOwnProperty.call(DOMESTIC_PRESET_MAP, providerId)) {
        return sendJson(res, 404, { error: '未知的国内预设模型厂商' });
      }
      const body = await readJsonBody(req, MAX_ADMIN_BODY_BYTES);
      const patch = parseUpdateModelPresetInput(body);
      const preset = db.upsertModelPreset(providerId, patch);
      return sendJson(res, 200, { preset });
    }

    if (method === 'GET' && pathname === '/user-api/admin/announcements') {
      const adminRow = requireAdmin(req, res);
      if (!adminRow) return;
      const mail = resolveMailConfig();
      const emailableUsers = db.listEmailableActiveUsers();
      return sendJson(res, 200, {
        announcements: db.listAllAnnouncements(),
        emailableUsersCount: emailableUsers.length,
        emailEnabled: mail.enabled,
      });
    }

    if (method === 'POST' && pathname === '/user-api/admin/announcements') {
      const adminRow = requireAdmin(req, res);
      if (!adminRow) return;
      const body = await readJsonBody(req, MAX_AUTH_BODY_BYTES);
      const input = parseCreateAnnouncementInput(body);
      const announcement = db.createAnnouncement(input);
      return sendJson(res, 201, { announcement });
    }

    const adminAnnouncementEmailMatch = pathname.match(
      /^\/user-api\/admin\/announcements\/([^/]+)\/send-email$/,
    );
    if (method === 'POST' && adminAnnouncementEmailMatch) {
      const adminRow = requireAdmin(req, res);
      if (!adminRow) return;
      const id = decodePathParam(adminAnnouncementEmailMatch[1]);
      const announcement = db.findAnnouncementById(id);
      if (!announcement) {
        return sendJson(res, 404, { error: '公告不存在' });
      }
      const mail = resolveMailConfig();
      if (!mail.enabled) {
        return sendJson(res, 400, { error: '请先配置并保存 Resend API Key 与发件人地址' });
      }
      const body = await readJsonBody(req, MAX_AUTH_BODY_BYTES);
      if (body.testTo !== undefined && body.testTo !== null) {
        const testTo = validateOptionalEmail(body.testTo);
        if (!testTo) {
          throw new PayloadError('请输入有效的测试收件邮箱地址', 400);
        }
        try {
          await sendAnnouncementEmail({
            apiKey: mail.apiKey,
            from: mail.from,
            to: testTo,
            username: adminRow.username,
            announcement,
            fetchImpl,
          });
        } catch (err) {
          return sendJson(res, 502, {
            error: err instanceof Error ? err.message : '测试推送邮件发送失败',
          });
        }
        return sendJson(res, 200, {
          ok: true,
          mode: 'test',
          sent: 1,
          failed: 0,
          total: 1,
          to: testTo,
        });
      }

      const recipients = db.listEmailableActiveUsers();
      if (recipients.length === 0) {
        return sendJson(res, 400, { error: '当前没有已绑定邮箱的活跃用户可推送' });
      }

      let sent = 0;
      let failed = 0;
      for (const recipient of recipients) {
        try {
          await sendAnnouncementEmail({
            apiKey: mail.apiKey,
            from: mail.from,
            to: recipient.email,
            username: recipient.username,
            announcement,
            fetchImpl,
          });
          sent += 1;
        } catch (err) {
          failed += 1;
          console.error(
            `[user-sync-api] announcement email failed for ${recipient.id}:`,
            err?.message || err,
          );
        }
      }

      const updatedAnnouncement =
        sent > 0 ? db.recordAnnouncementEmailed(id, sent) : announcement;
      return sendJson(res, 200, {
        ok: true,
        mode: 'broadcast',
        sent,
        failed,
        total: recipients.length,
        announcement: updatedAnnouncement,
      });
    }

    const adminAnnouncementMatch = pathname.match(/^\/user-api\/admin\/announcements\/([^/]+)$/);
    if (method === 'PATCH' && adminAnnouncementMatch) {
      const adminRow = requireAdmin(req, res);
      if (!adminRow) return;
      const id = decodePathParam(adminAnnouncementMatch[1]);
      const body = await readJsonBody(req, MAX_AUTH_BODY_BYTES);
      const patch = parseUpdateAnnouncementInput(body);
      const updated = db.updateAnnouncement(id, patch);
      if (!updated) {
        return sendJson(res, 404, { error: '公告不存在' });
      }
      return sendJson(res, 200, { announcement: updated });
    }

    if (method === 'DELETE' && adminAnnouncementMatch) {
      const adminRow = requireAdmin(req, res);
      if (!adminRow) return;
      const id = decodePathParam(adminAnnouncementMatch[1]);
      const deleted = db.deleteAnnouncement(id);
      if (!deleted) {
        return sendJson(res, 404, { error: '公告不存在' });
      }
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 404, { error: 'Not Found' });
  }

  const server = http.createServer((req, res) => {
    applyExtensionCors(req, res);
    handleRequest(req, res).catch((err) => {
      if (err instanceof PayloadError) {
        if (!res.headersSent) {
          return sendJson(res, err.statusCode, { error: err.message });
        }
        return;
      }
      console.error('[user-sync-api] Unhandled error:', err);
      if (!res.headersSent) {
        sendJson(res, 500, { error: '服务器内部错误' });
      }
    });
  });

  return {
    server,
    db,
    authRateLimiter,
    listen() {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(config.port, config.host, () => {
          server.off('error', reject);
          const addr = server.address();
          resolve({
            host: typeof addr === 'object' && addr ? addr.address : config.host,
            port: typeof addr === 'object' && addr ? addr.port : config.port,
          });
        });
      });
    },
    close() {
      return new Promise((resolve) => {
        server.close(() => {
          db.close();
          resolve();
        });
      });
    },
  };
}
