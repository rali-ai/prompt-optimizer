import crypto from 'node:crypto';
import { maskApiKey } from './mailer.js';
import { isValidTier, tierMeetsRequirement } from './membership.js';
import { PayloadError } from './sanitize.js';

export const MODEL_ID_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,63}$/;
export const MAX_CREDIT_COST = 10_000;
const MAX_URL_LENGTH = 500;
const MAX_PARAMS_BYTES = 16 * 1024;
const MAX_PARAMS_DEPTH = 6;
const FORBIDDEN_PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export const DOMESTIC_MODEL_PRESETS_DEFAULTS = Object.freeze([
  Object.freeze({
    providerId: 'deepseek',
    name: 'DeepSeek',
    category: 'text',
    defaultApplyUrl: 'https://platform.deepseek.com/api_keys',
  }),
  Object.freeze({
    providerId: 'dashscope',
    name: '通义千问 / 阿里云百炼',
    category: 'both',
    defaultApplyUrl: 'https://bailian.console.aliyun.com/#/api-key',
  }),
  Object.freeze({
    providerId: 'siliconflow',
    name: '硅基流动 SiliconFlow',
    category: 'both',
    defaultApplyUrl: 'https://cloud.siliconflow.cn/account/ak',
  }),
  Object.freeze({
    providerId: 'zhipu',
    name: '智谱 AI (GLM)',
    category: 'text',
    defaultApplyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
  }),
  Object.freeze({
    providerId: 'modelscope',
    name: '魔搭 ModelScope',
    category: 'both',
    defaultApplyUrl: 'https://modelscope.cn/my/myaccesstoken',
  }),
  Object.freeze({
    providerId: 'minimax',
    name: 'MiniMax 稀宇',
    category: 'text',
    defaultApplyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
  }),
  Object.freeze({
    providerId: 'xiaomi-mimo-token-plan',
    name: '小米 MiMo',
    category: 'text',
    defaultApplyUrl: 'https://platform.xiaomimimo.com',
  }),
  Object.freeze({
    providerId: 'seedream',
    name: '豆包 Seedream / 火山方舟',
    category: 'image',
    defaultApplyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
  }),
  Object.freeze({
    providerId: 'ollama',
    name: 'Ollama 本地模型',
    category: 'both',
    defaultApplyUrl: null,
  }),
  Object.freeze({
    providerId: 'openai-compatible',
    name: '自定义国内接口 (OpenAI 兼容)',
    category: 'text',
    defaultApplyUrl: null,
  }),
]);

export const DOMESTIC_PRESET_MAP = Object.freeze(
  Object.fromEntries(DOMESTIC_MODEL_PRESETS_DEFAULTS.map((item) => [item.providerId, item])),
);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateHttpUrl(raw, fieldLabel, { required = false } = {}) {
  if (raw === undefined || raw === null) {
    if (required) {
      throw new PayloadError(`${fieldLabel}不能为空`, 400);
    }
    return null;
  }
  if (typeof raw !== 'string') {
    throw new PayloadError(`${fieldLabel}必须为字符串`, 400);
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    if (required) {
      throw new PayloadError(`${fieldLabel}不能为空`, 400);
    }
    return null;
  }
  if (trimmed.length > MAX_URL_LENGTH) {
    throw new PayloadError(`${fieldLabel}长度不能超过 ${MAX_URL_LENGTH} 个字符`, 400);
  }
  if (/[\s\u0000-\u001f\u007f]/.test(trimmed)) {
    throw new PayloadError(`${fieldLabel}不能包含空白或控制字符`, 400);
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new PayloadError(`${fieldLabel}格式无效，仅支持 http:// 或 https:// 链接`, 400);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new PayloadError(`${fieldLabel}仅支持 http:// 或 https:// 协议`, 400);
  }
  if (!parsed.hostname) {
    throw new PayloadError(`${fieldLabel}缺少有效域名`, 400);
  }
  return trimmed;
}

function validateAndCloneParamsValue(value, fieldLabel, depth) {
  if (depth > MAX_PARAMS_DEPTH) {
    throw new PayloadError(`${fieldLabel} 嵌套层级过深`, 400);
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new PayloadError(`${fieldLabel} 不能包含非有限数字`, 400);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => validateAndCloneParamsValue(item, fieldLabel, depth + 1));
  }
  if (isPlainObject(value)) {
    const out = {};
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_PROTO_KEYS.has(key)) {
        throw new PayloadError(`${fieldLabel} 不能包含非法字段名：${key}`, 400);
      }
      if (value[key] === undefined) continue;
      out[key] = validateAndCloneParamsValue(value[key], fieldLabel, depth + 1);
    }
    return out;
  }
  throw new PayloadError(`${fieldLabel} 包含不支持的数据类型`, 400);
}

export function validateDefaultParams(raw, fieldLabel = 'defaultParams') {
  if (raw === undefined || raw === null) {
    return {};
  }
  if (!isPlainObject(raw)) {
    throw new PayloadError(`${fieldLabel} 必须为 JSON 对象`, 400);
  }
  const clean = validateAndCloneParamsValue(raw, fieldLabel, 0);
  const bytes = Buffer.byteLength(JSON.stringify(clean), 'utf8');
  if (bytes > MAX_PARAMS_BYTES) {
    throw new PayloadError(`${fieldLabel} 体积超过 16 KB 限制`, 400);
  }
  return clean;
}

function stripProtoKeysDeep(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stripProtoKeysDeep(item));
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const out = {};
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_PROTO_KEYS.has(key)) continue;
    out[key] = stripProtoKeysDeep(value[key]);
  }
  return out;
}

export function safeParseParamsJson(rawJson) {
  if (typeof rawJson !== 'string' || !rawJson.trim()) return {};
  try {
    const parsed = JSON.parse(rawJson);
    if (!isPlainObject(parsed)) return {};
    return stripProtoKeysDeep(parsed);
  } catch {
    return {};
  }
}

export function generateModelSlug(name) {
  const ascii = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/-+/g, '-')
    .replace(/-+$/, '');
  if (ascii.length >= 2) {
    return ascii.slice(0, 64);
  }
  return `model-${crypto.randomBytes(4).toString('hex')}`;
}

function validateText(raw, fieldLabel, { required = false, maxLength = 80, fallback = null } = {}) {
  if (raw === undefined || raw === null) {
    if (required) throw new PayloadError(`${fieldLabel}不能为空`, 400);
    return fallback;
  }
  if (typeof raw !== 'string') {
    throw new PayloadError(`${fieldLabel}必须为字符串`, 400);
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    if (required) throw new PayloadError(`${fieldLabel}不能为空`, 400);
    return fallback;
  }
  if (trimmed.length > maxLength) {
    throw new PayloadError(`${fieldLabel}不能超过 ${maxLength} 个字符`, 400);
  }
  return trimmed;
}

function validateCreditCost(raw, fallback) {
  if (raw === undefined && fallback !== undefined) return fallback;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw > MAX_CREDIT_COST) {
    throw new PayloadError(`creditCost 必须为 0 到 ${MAX_CREDIT_COST} 之间的整数`, 400);
  }
  return raw;
}

function validateMinTier(raw, fallback) {
  if (raw === undefined && fallback !== undefined) return fallback;
  if (!isValidTier(raw)) {
    throw new PayloadError('minTier 仅支持 free、standard、pro 或 internal', 400);
  }
  return raw;
}

function validateSortOrder(raw, fallback) {
  if (raw === undefined && fallback !== undefined) return fallback;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < -100000 || raw > 100000) {
    throw new PayloadError('sortOrder 必须为 -100000 到 100000 之间的整数', 400);
  }
  return raw;
}

function validateBoolean(raw, fieldName, fallback) {
  if (raw === undefined && fallback !== undefined) return fallback;
  if (typeof raw !== 'boolean') {
    throw new PayloadError(`${fieldName} 必须为布尔值`, 400);
  }
  return raw;
}

export function parseCreatePlatformModelInput(body) {
  if (!isPlainObject(body)) {
    throw new PayloadError('请求体必须为 JSON 对象', 400);
  }
  const name = validateText(body.name, '模型名称', { required: true, maxLength: 80 });
  let id = null;
  let explicitId = false;
  if (body.id !== undefined && body.id !== null && String(body.id).trim() !== '') {
    if (typeof body.id !== 'string') {
      throw new PayloadError('模型 ID 必须为字符串', 400);
    }
    const trimmedId = body.id.trim();
    if (!MODEL_ID_REGEX.test(trimmedId)) {
      throw new PayloadError('模型 ID 需为 2 到 64 位字母数字开头，仅允许字母、数字、点、下划线和短横线', 400);
    }
    id = trimmedId;
    explicitId = true;
  } else {
    id = generateModelSlug(name);
  }

  return {
    id,
    explicitId,
    name,
    providerLabel: validateText(body.providerLabel, '厂商标签', {
      required: false,
      maxLength: 60,
      fallback: '平台模型',
    }),
    baseUrl: validateHttpUrl(body.baseUrl, '接口地址 baseUrl', { required: true }),
    apiKey: validateText(body.apiKey, 'API Key', { required: true, maxLength: 512 }),
    upstreamModel: validateText(body.upstreamModel, '上游模型 ID', { required: true, maxLength: 128 }),
    creditCost: validateCreditCost(body.creditCost, 1),
    minTier: validateMinTier(body.minTier, 'standard'),
    defaultParams: validateDefaultParams(body.defaultParams, 'defaultParams'),
    applyUrl: validateHttpUrl(body.applyUrl, '推广/申请链接', { required: false }),
    description: validateText(body.description, '模型描述', { required: false, maxLength: 300, fallback: null }),
    sortOrder: validateSortOrder(body.sortOrder, 0),
    enabled: validateBoolean(body.enabled, 'enabled', true),
  };
}

export function parseUpdatePlatformModelInput(body) {
  if (!isPlainObject(body)) {
    throw new PayloadError('请求体必须为 JSON 对象', 400);
  }
  const patch = {};
  if (body.name !== undefined) {
    patch.name = validateText(body.name, '模型名称', { required: true, maxLength: 80 });
  }
  if (body.providerLabel !== undefined) {
    patch.providerLabel = validateText(body.providerLabel, '厂商标签', {
      required: false,
      maxLength: 60,
      fallback: '平台模型',
    });
  }
  if (body.baseUrl !== undefined) {
    patch.baseUrl = validateHttpUrl(body.baseUrl, '接口地址 baseUrl', { required: true });
  }
  if (body.apiKey !== undefined) {
    if (body.apiKey !== null && typeof body.apiKey !== 'string') {
      throw new PayloadError('API Key 必须为字符串', 400);
    }
    const trimmedKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    if (trimmedKey) {
      if (trimmedKey.length > 512) {
        throw new PayloadError('API Key 不能超过 512 个字符', 400);
      }
      patch.apiKey = trimmedKey;
    }
  }
  if (body.upstreamModel !== undefined) {
    patch.upstreamModel = validateText(body.upstreamModel, '上游模型 ID', { required: true, maxLength: 128 });
  }
  if (body.creditCost !== undefined) {
    patch.creditCost = validateCreditCost(body.creditCost);
  }
  if (body.minTier !== undefined) {
    patch.minTier = validateMinTier(body.minTier);
  }
  if (body.defaultParams !== undefined) {
    patch.defaultParams = validateDefaultParams(body.defaultParams, 'defaultParams');
  }
  if (body.applyUrl !== undefined) {
    patch.applyUrl = validateHttpUrl(body.applyUrl, '推广/申请链接', { required: false });
  }
  if (body.description !== undefined) {
    patch.description = validateText(body.description, '模型描述', {
      required: false,
      maxLength: 300,
      fallback: null,
    });
  }
  if (body.sortOrder !== undefined) {
    patch.sortOrder = validateSortOrder(body.sortOrder);
  }
  if (body.enabled !== undefined) {
    patch.enabled = validateBoolean(body.enabled, 'enabled');
  }

  if (Object.keys(patch).length === 0) {
    throw new PayloadError('请提供至少一个可更新的模型字段', 400);
  }
  return patch;
}

export function serializeAdminPlatformModel(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    providerLabel: row.provider_label,
    baseUrl: row.base_url,
    apiKeyHint: maskApiKey(row.api_key),
    hasApiKey: Boolean(row.api_key),
    upstreamModel: row.upstream_model,
    creditCost: Number(row.credit_cost || 0),
    minTier: row.min_tier,
    defaultParams: safeParseParamsJson(row.default_params_json),
    applyUrl: row.apply_url ?? null,
    description: row.description ?? null,
    sortOrder: Number(row.sort_order || 0),
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializePublicPlatformModel(row, userRow, now = Date.now()) {
  if (!row) return null;
  const activeUser = userRow && !userRow.disabled ? userRow : null;
  let accessible = false;
  let accessReason = 'login_required';
  if (activeUser) {
    if (tierMeetsRequirement(activeUser, row.min_tier, now)) {
      accessible = true;
      accessReason = null;
    } else {
      accessible = false;
      accessReason = 'tier_required';
    }
  }
  return {
    id: row.id,
    name: row.name,
    providerLabel: row.provider_label,
    creditCost: Number(row.credit_cost || 0),
    minTier: row.min_tier,
    defaultParams: safeParseParamsJson(row.default_params_json),
    applyUrl: row.apply_url ?? null,
    description: row.description ?? null,
    sortOrder: Number(row.sort_order || 0),
    accessible,
    accessReason,
  };
}

export function buildUpstreamChatPayload(rawModelRow, clientBody) {
  const defaultParams = safeParseParamsJson(rawModelRow.default_params_json);
  const cleanClient = stripProtoKeysDeep(isPlainObject(clientBody) ? clientBody : {});
  return {
    ...defaultParams,
    ...cleanClient,
    model: rawModelRow.upstream_model,
  };
}

export function mergeDomesticPreset(def, overrideRow) {
  const customApplyUrl = overrideRow?.apply_url ?? null;
  const applyUrl = customApplyUrl || def.defaultApplyUrl || null;
  return {
    providerId: def.providerId,
    name: def.name,
    category: def.category,
    applyUrl,
    customApplyUrl,
    defaultApplyUrl: def.defaultApplyUrl,
    applyLabel: overrideRow?.apply_label ?? null,
    defaultModelId: overrideRow?.default_model_id ?? null,
    defaultParams: overrideRow ? safeParseParamsJson(overrideRow.default_params_json) : {},
    enabled: overrideRow ? Boolean(overrideRow.enabled) : true,
    updatedAt: overrideRow?.updated_at ?? null,
  };
}

export function parseUpdateModelPresetInput(body) {
  if (!isPlainObject(body)) {
    throw new PayloadError('请求体必须为 JSON 对象', 400);
  }
  const patch = {};

  if (body.customApplyUrl !== undefined) {
    patch.applyUrl = validateHttpUrl(body.customApplyUrl, '推广/申请链接', { required: false });
  } else if (body.applyUrl !== undefined) {
    patch.applyUrl = validateHttpUrl(body.applyUrl, '推广/申请链接', { required: false });
  }

  if (body.applyLabel !== undefined) {
    patch.applyLabel = validateText(body.applyLabel, '按钮文案', {
      required: false,
      maxLength: 40,
      fallback: null,
    });
  }

  if (body.defaultModelId !== undefined) {
    patch.defaultModelId = validateText(body.defaultModelId, '默认模型 ID', {
      required: false,
      maxLength: 128,
      fallback: null,
    });
  }

  if (body.defaultParams !== undefined) {
    patch.defaultParams = validateDefaultParams(body.defaultParams, 'defaultParams');
  }

  if (body.enabled !== undefined) {
    patch.enabled = validateBoolean(body.enabled, 'enabled');
  }

  if (Object.keys(patch).length === 0) {
    throw new PayloadError('请提供至少一个可更新的预设字段', 400);
  }
  return patch;
}
