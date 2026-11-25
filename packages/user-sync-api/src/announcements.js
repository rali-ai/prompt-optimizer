import { getEffectiveTier } from './membership.js';
import { PayloadError } from './sanitize.js';

export const MAX_TITLE_LENGTH = 80;
export const MAX_CONTENT_LENGTH = 800;
export const MAX_LINK_URL_LENGTH = 500;
export const MAX_LINK_TEXT_LENGTH = 32;
export const MAX_COMMENT_LENGTH = 500;
const COMMENT_FORBIDDEN_CONTROL_REGEX = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export const ANNOUNCEMENT_TYPES = Object.freeze({
  notice: Object.freeze({
    key: 'notice',
    label: '重要通知',
    emailBadgeBg: 'rgba(15,118,110,0.11)',
    emailBadgeColor: '#0F766E',
    adminBadgeClass: 'badge-pro',
  }),
  activity: Object.freeze({
    key: 'activity',
    label: '活动公告',
    emailBadgeBg: 'rgba(217,107,67,0.14)',
    emailBadgeColor: '#9A3412',
    adminBadgeClass: 'badge-admin',
  }),
  maintenance: Object.freeze({
    key: 'maintenance',
    label: '维护提示',
    emailBadgeBg: '#FEF3C7',
    emailBadgeColor: '#92400E',
    adminBadgeClass: 'badge-warn',
  }),
});

export const ANNOUNCEMENT_TYPE_KEYS = Object.freeze(Object.keys(ANNOUNCEMENT_TYPES));

export function getAnnouncementTypeMeta(type) {
  if (typeof type === 'string' && Object.prototype.hasOwnProperty.call(ANNOUNCEMENT_TYPES, type)) {
    return ANNOUNCEMENT_TYPES[type];
  }
  return ANNOUNCEMENT_TYPES.notice;
}

export function isAnnouncementCurrentlyActive(announcement, now = Date.now()) {
  if (!announcement || !announcement.isActive) return false;
  if (announcement.expiresAt !== null && announcement.expiresAt <= now) return false;
  return true;
}

export function serializeAnnouncement(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    type: row.type,
    linkUrl: row.link_url ?? null,
    linkText: row.link_text ?? null,
    isActive: Boolean(row.is_active),
    isPinned: Boolean(row.is_pinned),
    expiresAt: row.expires_at ?? null,
    emailedAt: row.emailed_at ?? null,
    emailedCount: Number(row.emailed_count ?? 0),
    commentCount: Number(row.comment_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeAnnouncementComment(row, now = Date.now()) {
  if (!row) return null;
  return {
    id: row.id,
    announcementId: row.announcement_id,
    userId: row.user_id,
    username: row.username,
    role: row.role,
    tier: row.tier,
    effectiveTier: getEffectiveTier(row, now),
    content: row.content,
    createdAt: row.created_at,
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateTitle(raw) {
  if (typeof raw !== 'string') {
    throw new PayloadError('公告标题必须为字符串', 400);
  }
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_TITLE_LENGTH) {
    throw new PayloadError(`公告标题不能为空且不能超过 ${MAX_TITLE_LENGTH} 个字符`, 400);
  }
  return trimmed;
}

function validateContent(raw) {
  if (typeof raw !== 'string') {
    throw new PayloadError('公告内容必须为字符串', 400);
  }
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_CONTENT_LENGTH) {
    throw new PayloadError(`公告内容不能为空且不能超过 ${MAX_CONTENT_LENGTH} 个字符`, 400);
  }
  return trimmed;
}

function validateType(raw, fallback) {
  if (raw === undefined && fallback !== undefined) {
    return fallback;
  }
  if (typeof raw !== 'string' || !Object.prototype.hasOwnProperty.call(ANNOUNCEMENT_TYPES, raw)) {
    throw new PayloadError('公告类型仅支持 notice、activity 或 maintenance', 400);
  }
  return raw;
}

function validateLinkUrl(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') {
    throw new PayloadError('跳转链接必须为字符串', 400);
  }
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_LINK_URL_LENGTH) {
    throw new PayloadError(`跳转链接长度不能超过 ${MAX_LINK_URL_LENGTH} 个字符`, 400);
  }
  if (/[\s\u0000-\u001f\u007f]/.test(trimmed)) {
    throw new PayloadError('跳转链接不能包含空白或控制字符', 400);
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new PayloadError('跳转链接格式无效，仅支持 http:// 或 https:// 链接', 400);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new PayloadError('跳转链接仅支持 http:// 或 https:// 协议', 400);
  }
  if (!parsed.hostname) {
    throw new PayloadError('跳转链接缺少有效域名', 400);
  }
  return trimmed;
}

function validateLinkText(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') {
    throw new PayloadError('按钮文案必须为字符串', 400);
  }
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_LINK_TEXT_LENGTH) {
    throw new PayloadError(`按钮文案长度不能超过 ${MAX_LINK_TEXT_LENGTH} 个字符`, 400);
  }
  return trimmed;
}

function validateBoolean(raw, fieldName, fallback) {
  if (raw === undefined && fallback !== undefined) {
    return fallback;
  }
  if (typeof raw !== 'boolean') {
    throw new PayloadError(`${fieldName} 必须为布尔值`, 400);
  }
  return raw;
}

function validateExpiresAt(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw <= 0) {
    throw new PayloadError('expiresAt 必须为大于 0 的毫秒时间戳整数或 null', 400);
  }
  return raw;
}

export function parseCreateAnnouncementInput(body) {
  if (!isPlainObject(body)) {
    throw new PayloadError('请求体必须为 JSON 对象', 400);
  }
  return {
    title: validateTitle(body.title),
    content: validateContent(body.content),
    type: validateType(body.type, 'notice'),
    linkUrl: validateLinkUrl(body.linkUrl),
    linkText: validateLinkText(body.linkText),
    isActive: validateBoolean(body.isActive, 'isActive', true),
    isPinned: validateBoolean(body.isPinned, 'isPinned', false),
    expiresAt: validateExpiresAt(body.expiresAt),
  };
}

export function parseUpdateAnnouncementInput(body) {
  if (!isPlainObject(body)) {
    throw new PayloadError('请求体必须为 JSON 对象', 400);
  }
  const patch = {};
  if (body.title !== undefined) {
    patch.title = validateTitle(body.title);
  }
  if (body.content !== undefined) {
    patch.content = validateContent(body.content);
  }
  if (body.type !== undefined) {
    patch.type = validateType(body.type);
  }
  if (body.linkUrl !== undefined) {
    patch.linkUrl = validateLinkUrl(body.linkUrl);
  }
  if (body.linkText !== undefined) {
    patch.linkText = validateLinkText(body.linkText);
  }
  if (body.isActive !== undefined) {
    patch.isActive = validateBoolean(body.isActive, 'isActive');
  }
  if (body.isPinned !== undefined) {
    patch.isPinned = validateBoolean(body.isPinned, 'isPinned');
  }
  if (body.expiresAt !== undefined) {
    patch.expiresAt = validateExpiresAt(body.expiresAt);
  }
  if (Object.keys(patch).length === 0) {
    throw new PayloadError('请提供至少一个可更新的公告字段', 400);
  }
  return patch;
}

export function parseCreateCommentInput(body) {
  if (!isPlainObject(body)) {
    throw new PayloadError('请求体必须为 JSON 对象', 400);
  }
  if (typeof body.content !== 'string') {
    throw new PayloadError('评论内容必须为字符串', 400);
  }
  if (COMMENT_FORBIDDEN_CONTROL_REGEX.test(body.content)) {
    throw new PayloadError('评论内容不能包含非法控制字符', 400);
  }
  const content = body.content.trim();
  if (!content || content.length > MAX_COMMENT_LENGTH) {
    throw new PayloadError(`评论内容不能为空且不能超过 ${MAX_COMMENT_LENGTH} 个字符`, 400);
  }
  return { content };
}
