import { PayloadError } from './sanitize.js';

export const TIER_META = Object.freeze({
  free: Object.freeze({
    key: 'free',
    rank: 0,
    label: '非会员',
    defaultMonthlyCredits: 0,
    badgeClass: 'badge-free',
  }),
  standard: Object.freeze({
    key: 'standard',
    rank: 1,
    label: '标准会员',
    defaultMonthlyCredits: 100,
    badgeClass: 'badge-standard',
  }),
  pro: Object.freeze({
    key: 'pro',
    rank: 2,
    label: '专业会员',
    defaultMonthlyCredits: 500,
    badgeClass: 'badge-pro',
  }),
  internal: Object.freeze({
    key: 'internal',
    rank: 3,
    label: '内部会员',
    defaultMonthlyCredits: 1000,
    badgeClass: 'badge-internal',
  }),
});

export const TIER_KEYS = Object.freeze(['free', 'standard', 'pro', 'internal']);

export const DEFAULT_MONTHLY_CREDITS = Object.freeze({
  free: 0,
  standard: 100,
  pro: 500,
  internal: 1000,
});

export const MONTHLY_CREDIT_SETTING_KEYS = Object.freeze({
  free: 'monthly_credits_free',
  standard: 'monthly_credits_standard',
  pro: 'monthly_credits_pro',
  internal: 'monthly_credits_internal',
});

export const MAX_MONTHLY_CREDITS = 1_000_000;
export const MAX_CREDIT_ADJUST_ABS = 1_000_000;
const CHINA_TZ_OFFSET_MS = 8 * 60 * 60 * 1000;

export function isValidTier(value) {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TIER_META, value);
}

export function getTierMeta(tier) {
  if (isValidTier(tier)) {
    return TIER_META[tier];
  }
  return TIER_META.free;
}

export function getTierRank(tier) {
  return getTierMeta(tier).rank;
}

export function getEffectiveTier(userRow, now = Date.now()) {
  if (!userRow) return 'free';
  if (userRow.role === 'admin') return 'internal';

  const tier = userRow.tier;
  if (tier === 'standard' || tier === 'pro' || tier === 'internal') {
    const expiresAt =
      userRow.tier_expires_at !== undefined ? userRow.tier_expires_at : userRow.tierExpiresAt;
    if (expiresAt === null || expiresAt === undefined || expiresAt > now) {
      return tier;
    }
    return 'free';
  }
  return 'free';
}

export function tierMeetsRequirement(userRow, minTier, now = Date.now()) {
  return getTierRank(getEffectiveTier(userRow, now)) >= getTierRank(minTier);
}

export function getChinaMonthKey(now = Date.now()) {
  const shanghai = new Date(now + CHINA_TZ_OFFSET_MS);
  const year = shanghai.getUTCFullYear();
  const month = String(shanghai.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function parseMonthlyCreditsPatch(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new PayloadError('monthlyCredits 必须为对象', 400);
  }
  const patch = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isValidTier(key)) {
      throw new PayloadError(`monthlyCredits 包含无效等级字段：${key}`, 400);
    }
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > MAX_MONTHLY_CREDITS) {
      throw new PayloadError(`monthlyCredits.${key} 必须为 0 到 ${MAX_MONTHLY_CREDITS} 之间的整数`, 400);
    }
    patch[key] = value;
  }
  if (Object.keys(patch).length === 0) {
    throw new PayloadError('monthlyCredits 至少需要包含一个会员等级配置', 400);
  }
  return patch;
}

export function parseCreditAdjustInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new PayloadError('请求体必须为 JSON 对象', 400);
  }
  const delta = body.delta;
  if (
    typeof delta !== 'number' ||
    !Number.isInteger(delta) ||
    delta === 0 ||
    delta < -MAX_CREDIT_ADJUST_ABS ||
    delta > MAX_CREDIT_ADJUST_ABS
  ) {
    throw new PayloadError(`delta 必须为 -${MAX_CREDIT_ADJUST_ABS} 到 ${MAX_CREDIT_ADJUST_ABS} 之间的非零整数`, 400);
  }

  let note = null;
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== 'string') {
      throw new PayloadError('note 必须为字符串', 400);
    }
    const trimmed = body.note.trim();
    if (trimmed.length > 200) {
      throw new PayloadError('备注长度不能超过 200 个字符', 400);
    }
    note = trimmed || null;
  }

  return { delta, note };
}

export function serializeCreditLedgerRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    delta: Number(row.delta),
    balanceAfter: Number(row.balance_after),
    reason: row.reason,
    modelId: row.model_id ?? null,
    note: row.note ?? null,
    createdAt: row.created_at,
  };
}
