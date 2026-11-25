export type MembershipTier = 'free' | 'standard' | 'pro' | 'internal'

export interface MonthlyCreditsConfig {
  free: number
  standard: number
  pro: number
  internal: number
}

export interface UserSyncConfig {
  membershipEnabled: boolean
  registrationEnabled: boolean
  emailResetEnabled?: boolean
  monthlyCredits?: MonthlyCreditsConfig
}

export interface SyncUser {
  id: string
  username: string
  email?: string | null
  role: 'user' | 'admin'
  tier: MembershipTier
  effectiveTier?: MembershipTier
  tierExpiresAt: number | null
  creditBalance?: number
  lastCreditGrantMonth?: string | null
  lastCreditGrantAmount?: number
  disabled: boolean
  createdAt: number
  updatedAt: number
}

export interface CreditLedgerEntry {
  id: string
  delta: number
  balanceAfter: number
  reason: string
  modelId: string | null
  note: string | null
  createdAt: number
}

export interface UserCreditsResponse {
  balance: number
  tier: MembershipTier
  effectiveTier: MembershipTier
  tierExpiresAt: number | null
  monthlyAllowance: number
  currentMonth: string
  grantedThisMonth: number
  monthlyCredits: MonthlyCreditsConfig
  ledger: CreditLedgerEntry[]
}

export interface PublicPlatformModel {
  id: string
  name: string
  providerLabel: string
  creditCost: number
  minTier: MembershipTier
  defaultParams: Record<string, unknown>
  applyUrl: string | null
  description: string | null
  sortOrder: number
  autoFallback?: boolean
  fallbackModelId?: string | null
  inCooldown?: boolean
  accessible: boolean
  accessReason: string | null
}

export interface DomesticModelPreset {
  providerId: string
  name: string
  category: 'text' | 'image' | 'both'
  applyUrl: string | null
  customApplyUrl: string | null
  defaultApplyUrl: string | null
  applyLabel: string
  defaultModelId: string | null
  defaultParams: Record<string, unknown>
  featured?: boolean
  enabled: boolean
  updatedAt: number | null
}

export interface SyncPayload {
  favorites?: unknown
  history?: unknown
  templates?: unknown
  variables?: unknown
  preferences?: unknown
}

export interface PullSyncResponse {
  version: number
  updatedAt: number | null
  data: SyncPayload | null
}

export interface PushSyncResponse {
  version: number
  updatedAt: number
  bytes: number
}

export type AnnouncementType = 'notice' | 'activity' | 'maintenance'

export interface ActiveAnnouncement {
  id: string
  title: string
  content: string
  type: AnnouncementType
  linkUrl: string | null
  linkText: string | null
  isActive: boolean
  isPinned: boolean
  expiresAt: number | null
  commentCount: number
  createdAt: number
  updatedAt: number
}

export interface AnnouncementComment {
  id: string
  announcementId: string
  userId: string
  username: string
  role: 'user' | 'admin'
  tier: MembershipTier
  effectiveTier: MembershipTier
  content: string
  createdAt: number
}

export class UserSyncError extends Error {
  readonly status: number
  readonly currentVersion?: number

  constructor(message: string, status: number, currentVersion?: number) {
    super(message)
    this.name = 'UserSyncError'
    this.status = status
    this.currentVersion = currentVersion
  }
}

const DEFAULT_BASE_URL = '/user-api'
export const EXTENSION_SYNC_BASE_URL = 'https://goprmpt.net/user-api'
const EXTENSION_TOKEN_STORAGE_KEY = 'goprmpt_extension_sync_token'

export function isExtensionRuntime(): boolean {
  if (typeof window === 'undefined' || !window.location) return false
  return (
    window.location.protocol === 'chrome-extension:' ||
    window.location.protocol === 'moz-extension:'
  )
}

export function resolveDefaultSyncBaseUrl(): string {
  return isExtensionRuntime() ? EXTENSION_SYNC_BASE_URL : DEFAULT_BASE_URL
}

export function getStoredExtensionToken(): string {
  return readStoredToken()
}

export function resolvePlatformAiBaseUrl(baseUrl?: string): string {
  const raw = typeof baseUrl === 'string' && baseUrl.trim() ? baseUrl.trim() : resolveDefaultSyncBaseUrl()
  const normalized = raw.replace(/\/+$/, '')
  if (/^https?:\/\//i.test(normalized)) {
    return `${normalized}/ai/v1`
  }
  const normalizedPath = normalized.startsWith('/') ? normalized : `/${normalized}`
  if (typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null') {
    return `${window.location.origin.replace(/\/+$/, '')}${normalizedPath}/ai/v1`
  }
  return `${normalizedPath}/ai/v1`
}

function readStoredToken(): string {
  if (!isExtensionRuntime()) return ''
  try {
    return window.localStorage?.getItem(EXTENSION_TOKEN_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

function writeStoredToken(token: string | null): void {
  if (!isExtensionRuntime()) return
  try {
    if (!token) {
      window.localStorage?.removeItem(EXTENSION_TOKEN_STORAGE_KEY)
    } else {
      window.localStorage?.setItem(EXTENSION_TOKEN_STORAGE_KEY, token)
    }
  } catch {
    // ignore storage quota/privacy errors
  }
}

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
])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stripForbiddenDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stripForbiddenDeep(item))
  }
  if (!isPlainObject(value)) {
    return value
  }
  const result: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) continue
    result[key] = stripForbiddenDeep(val)
  }
  return result
}

/**
 * BYOK guard on the client side: removes `models`, `imageModels`, and any
 * nested API/secret key fields before uploading user data to `/user-api/sync`.
 * Accepts either a direct SyncPayload or DataManager.exportAllData() output.
 */
export function stripSecretsForSync(exportedData: unknown): SyncPayload {
  if (!isPlainObject(exportedData)) {
    return {}
  }

  const source =
    isPlainObject(exportedData.data) && 'version' in exportedData
      ? exportedData.data
      : exportedData

  const payload: SyncPayload = {}

  if (source.favorites !== undefined) {
    payload.favorites = stripForbiddenDeep(source.favorites)
  } else if (exportedData.favorites !== undefined) {
    payload.favorites = stripForbiddenDeep(exportedData.favorites)
  }

  if (source.history !== undefined) {
    payload.history = stripForbiddenDeep(source.history)
  }

  const rawTemplates = source.templates !== undefined ? source.templates : source.userTemplates
  if (rawTemplates !== undefined) {
    payload.templates = stripForbiddenDeep(rawTemplates)
  }

  const rawVariables = source.variables !== undefined ? source.variables : source.contexts
  if (rawVariables !== undefined) {
    payload.variables = stripForbiddenDeep(rawVariables)
  }

  const rawPreferences = source.preferences !== undefined ? source.preferences : source.userSettings
  if (rawPreferences !== undefined) {
    payload.preferences = stripForbiddenDeep(rawPreferences)
  }

  return payload
}

/**
 * Converts a pulled SyncPayload back into the DataManager v1 import envelope,
 * intentionally omitting `models` and `imageModels` so local API keys stay intact.
 */
export function toDataManagerImportEnvelope(payload: SyncPayload): {
  version: 1
  data: Record<string, unknown>
} | null {
  const data: Record<string, unknown> = {}
  if (payload.history !== undefined) data.history = payload.history
  if (payload.templates !== undefined) data.userTemplates = payload.templates
  if (payload.preferences !== undefined) data.userSettings = payload.preferences
  if (payload.variables !== undefined) data.contexts = payload.variables
  if (Object.keys(data).length === 0) return null
  return { version: 1, data }
}

async function requestJson<T>(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const extMode = isExtensionRuntime()
  const bearer = extMode ? readStoredToken() : ''
  let response: Response
  try {
    response = await fetchImpl(url, {
      credentials: extMode ? 'omit' : 'same-origin',
      ...init,
      headers: {
        Accept: 'application/json',
        ...(extMode ? { 'X-Client-Type': 'extension' } : {}),
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    })
  } catch (err) {
    throw new UserSyncError(
      err instanceof Error && err.message ? err.message : '网络异常，请稍后重试',
      0,
    )
  }

  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null

  if (!response.ok) {
    const message =
      typeof body?.error === 'string' && body.error
        ? body.error
        : `请求失败（HTTP ${response.status}）`
    const currentVersion =
      typeof body?.currentVersion === 'number' ? body.currentVersion : undefined
    throw new UserSyncError(message, response.status, currentVersion)
  }

  return body as T
}

function joinUrl(baseUrl: string, suffix: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${suffix}`
}

export async function getConfig(
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<UserSyncConfig> {
  return requestJson<UserSyncConfig>(joinUrl(baseUrl, '/config'), { method: 'GET' }, fetchImpl)
}

export async function getMe(
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<SyncUser | null> {
  if (isExtensionRuntime() && !readStoredToken()) {
    return null
  }
  try {
    const res = await requestJson<{ user: SyncUser }>(
      joinUrl(baseUrl, '/me'),
      { method: 'GET' },
      fetchImpl,
    )
    return res.user
  } catch (err) {
    if (err instanceof UserSyncError && err.status === 401) {
      writeStoredToken(null)
      return null
    }
    throw err
  }
}

export async function register(
  username: string,
  password: string,
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl: typeof fetch = fetch,
  email?: string,
): Promise<SyncUser> {
  const payload: { username: string; password: string; email?: string } = { username, password }
  if (typeof email === 'string' && email.trim()) {
    payload.email = email.trim()
  }
  const res = await requestJson<{ user: SyncUser; token?: string }>(
    joinUrl(baseUrl, '/register'),
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    fetchImpl,
  )
  if (typeof res.token === 'string' && res.token) {
    writeStoredToken(res.token)
  }
  return res.user
}

export async function updateProfile(
  email: string | null,
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<SyncUser> {
  const res = await requestJson<{ user: SyncUser }>(
    joinUrl(baseUrl, '/me/profile'),
    {
      method: 'PATCH',
      body: JSON.stringify({ email }),
    },
    fetchImpl,
  )
  return res.user
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<SyncUser> {
  const res = await requestJson<{ ok: boolean; user: SyncUser; token?: string }>(
    joinUrl(baseUrl, '/me/password'),
    {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    },
    fetchImpl,
  )
  if (typeof res.token === 'string' && res.token) {
    writeStoredToken(res.token)
  }
  return res.user
}

export async function requestPasswordReset(
  email: string,
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; message: string }> {
  return requestJson<{ ok: boolean; message: string }>(
    joinUrl(baseUrl, '/password-reset/request'),
    {
      method: 'POST',
      body: JSON.stringify({ email }),
    },
    fetchImpl,
  )
}

export async function confirmPasswordReset(
  email: string,
  code: string,
  newPassword: string,
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; message: string }> {
  return requestJson<{ ok: boolean; message: string }>(
    joinUrl(baseUrl, '/password-reset/confirm'),
    {
      method: 'POST',
      body: JSON.stringify({ email, code, newPassword }),
    },
    fetchImpl,
  )
}

export async function login(
  username: string,
  password: string,
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<SyncUser> {
  const res = await requestJson<{ user: SyncUser; token?: string }>(
    joinUrl(baseUrl, '/login'),
    {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    },
    fetchImpl,
  )
  if (typeof res.token === 'string' && res.token) {
    writeStoredToken(res.token)
  }
  return res.user
}

export async function logout(
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  try {
    await requestJson<{ ok: boolean }>(joinUrl(baseUrl, '/logout'), { method: 'POST' }, fetchImpl)
  } finally {
    writeStoredToken(null)
  }
}

export async function pullSync(
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<PullSyncResponse> {
  return requestJson<PullSyncResponse>(joinUrl(baseUrl, '/sync'), { method: 'GET' }, fetchImpl)
}

export async function pushSync(
  data: unknown,
  expectedVersion?: number,
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<PushSyncResponse> {
  const sanitized = stripSecretsForSync(data)
  const payload: { data: SyncPayload; expectedVersion?: number } = { data: sanitized }
  if (typeof expectedVersion === 'number') {
    payload.expectedVersion = expectedVersion
  }
  return requestJson<PushSyncResponse>(
    joinUrl(baseUrl, '/sync'),
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    fetchImpl,
  )
}

export function announcementDismissKey(
  item: Pick<ActiveAnnouncement, 'id' | 'updatedAt'>,
): string {
  return `${item.id}:${item.updatedAt}`
}

export function safeAnnouncementUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}

function normalizeAnnouncementType(raw: unknown): AnnouncementType {
  if (raw === 'activity' || raw === 'maintenance' || raw === 'notice') {
    return raw
  }
  return 'notice'
}

function normalizeAnnouncement(raw: unknown): ActiveAnnouncement | null {
  if (!isPlainObject(raw)) return null
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  if (!id || !title) return null
  const rawCommentCount =
    typeof raw.commentCount === 'number' && Number.isFinite(raw.commentCount)
      ? Math.max(0, Math.floor(raw.commentCount))
      : 0
  return {
    id,
    title,
    content: typeof raw.content === 'string' ? raw.content : '',
    type: normalizeAnnouncementType(raw.type),
    linkUrl: safeAnnouncementUrl(raw.linkUrl),
    linkText: typeof raw.linkText === 'string' && raw.linkText.trim() ? raw.linkText.trim() : null,
    isActive: raw.isActive !== false,
    isPinned: Boolean(raw.isPinned),
    expiresAt: typeof raw.expiresAt === 'number' && Number.isFinite(raw.expiresAt) ? raw.expiresAt : null,
    commentCount: rawCommentCount,
    createdAt: typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : 0,
    updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0,
  }
}

export async function getActiveAnnouncements(
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<ActiveAnnouncement[]> {
  const res = await requestJson<{ announcements?: unknown }>(
    joinUrl(baseUrl, '/announcements/active'),
    { method: 'GET' },
    fetchImpl,
  )
  if (!isPlainObject(res) || !Array.isArray(res.announcements)) {
    return []
  }
  const items: ActiveAnnouncement[] = []
  for (const entry of res.announcements) {
    const normalized = normalizeAnnouncement(entry)
    if (normalized) items.push(normalized)
  }
  return items
}

function normalizeAnnouncementComment(raw: unknown): AnnouncementComment | null {
  if (!isPlainObject(raw)) return null
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  const announcementId = typeof raw.announcementId === 'string' ? raw.announcementId.trim() : ''
  const userId = typeof raw.userId === 'string' ? raw.userId.trim() : ''
  const username = typeof raw.username === 'string' ? raw.username.trim() : ''
  const content = typeof raw.content === 'string' ? raw.content : ''
  if (!id || !announcementId || !username || !content.trim()) return null
  const tier = normalizeMembershipTier(raw.tier)
  const effectiveTier =
    raw.effectiveTier !== undefined ? normalizeMembershipTier(raw.effectiveTier) : tier
  return {
    id,
    announcementId,
    userId,
    username,
    role: raw.role === 'admin' ? 'admin' : 'user',
    tier,
    effectiveTier,
    content,
    createdAt: normalizeFiniteNumber(raw.createdAt, 0),
  }
}

export async function getAnnouncementComments(
  announcementId: string,
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<{ comments: AnnouncementComment[]; commentCount: number }> {
  const id = String(announcementId || '').trim()
  if (!id) {
    return { comments: [], commentCount: 0 }
  }
  const res = await requestJson<{ comments?: unknown; commentCount?: unknown }>(
    joinUrl(baseUrl, `/announcements/${encodeURIComponent(id)}/comments`),
    { method: 'GET' },
    fetchImpl,
  )
  const rawComments = isPlainObject(res) && Array.isArray(res.comments) ? res.comments : []
  const comments: AnnouncementComment[] = []
  for (const entry of rawComments) {
    const normalized = normalizeAnnouncementComment(entry)
    if (normalized) comments.push(normalized)
  }
  const commentCount =
    isPlainObject(res) && typeof res.commentCount === 'number' && Number.isFinite(res.commentCount)
      ? Math.max(0, Math.floor(res.commentCount))
      : comments.length
  return { comments, commentCount }
}

export async function createAnnouncementComment(
  announcementId: string,
  content: string,
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<{ comment: AnnouncementComment; commentCount: number }> {
  const id = String(announcementId || '').trim()
  const res = await requestJson<{ comment?: unknown; commentCount?: unknown }>(
    joinUrl(baseUrl, `/announcements/${encodeURIComponent(id)}/comments`),
    {
      method: 'POST',
      body: JSON.stringify({ content }),
    },
    fetchImpl,
  )
  const comment = normalizeAnnouncementComment(isPlainObject(res) ? res.comment : null)
  if (!comment) {
    throw new UserSyncError('评论响应异常', 500)
  }
  const commentCount =
    isPlainObject(res) && typeof res.commentCount === 'number' && Number.isFinite(res.commentCount)
      ? Math.max(0, Math.floor(res.commentCount))
      : 1
  return { comment, commentCount }
}

export async function deleteAnnouncementComment(
  announcementId: string,
  commentId: string,
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; commentCount: number }> {
  const annId = String(announcementId || '').trim()
  const cId = String(commentId || '').trim()
  const res = await requestJson<{ ok?: unknown; commentCount?: unknown }>(
    joinUrl(
      baseUrl,
      `/announcements/${encodeURIComponent(annId)}/comments/${encodeURIComponent(cId)}`,
    ),
    { method: 'DELETE' },
    fetchImpl,
  )
  const commentCount =
    isPlainObject(res) && typeof res.commentCount === 'number' && Number.isFinite(res.commentCount)
      ? Math.max(0, Math.floor(res.commentCount))
      : 0
  return {
    ok: isPlainObject(res) ? res.ok !== false : true,
    commentCount,
  }
}

function normalizeMembershipTier(raw: unknown): MembershipTier {
  if (raw === 'free' || raw === 'standard' || raw === 'pro' || raw === 'internal') {
    return raw
  }
  return 'free'
}

function normalizeFiniteNumber(raw: unknown, fallback = 0): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback
}

function normalizeNullableNumber(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null
}

function normalizeOptionalString(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed ? trimmed : null
}

function normalizePlainParams(raw: unknown): Record<string, unknown> {
  return isPlainObject(raw) ? { ...raw } : {}
}

function normalizeMonthlyCredits(raw: unknown): MonthlyCreditsConfig {
  const src = isPlainObject(raw) ? raw : {}
  return {
    free: Math.max(0, normalizeFiniteNumber(src.free, 0)),
    standard: Math.max(0, normalizeFiniteNumber(src.standard, 0)),
    pro: Math.max(0, normalizeFiniteNumber(src.pro, 0)),
    internal: Math.max(0, normalizeFiniteNumber(src.internal, 0)),
  }
}

function normalizeCreditLedgerEntry(raw: unknown): CreditLedgerEntry | null {
  if (!isPlainObject(raw)) return null
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  if (!id) return null
  return {
    id,
    delta: normalizeFiniteNumber(raw.delta, 0),
    balanceAfter: normalizeFiniteNumber(raw.balanceAfter, 0),
    reason: typeof raw.reason === 'string' && raw.reason.trim() ? raw.reason.trim() : 'unknown',
    modelId: normalizeOptionalString(raw.modelId),
    note: normalizeOptionalString(raw.note),
    createdAt: normalizeFiniteNumber(raw.createdAt, 0),
  }
}

function normalizePublicPlatformModel(raw: unknown): PublicPlatformModel | null {
  if (!isPlainObject(raw)) return null
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!id || !name) return null
  return {
    id,
    name,
    providerLabel:
      typeof raw.providerLabel === 'string' && raw.providerLabel.trim()
        ? raw.providerLabel.trim()
        : '平台模型',
    creditCost: Math.max(0, normalizeFiniteNumber(raw.creditCost, 0)),
    minTier: normalizeMembershipTier(raw.minTier),
    defaultParams: normalizePlainParams(raw.defaultParams),
    applyUrl: safeAnnouncementUrl(raw.applyUrl),
    description: normalizeOptionalString(raw.description),
    sortOrder: normalizeFiniteNumber(raw.sortOrder, 0),
    autoFallback: raw.autoFallback === undefined ? true : Boolean(raw.autoFallback),
    fallbackModelId: normalizeOptionalString(raw.fallbackModelId),
    inCooldown: Boolean(raw.inCooldown),
    accessible: Boolean(raw.accessible),
    accessReason: normalizeOptionalString(raw.accessReason),
  }
}

function normalizePresetCategory(raw: unknown): 'text' | 'image' | 'both' {
  if (raw === 'text' || raw === 'image' || raw === 'both') {
    return raw
  }
  return 'text'
}

function normalizeDomesticModelPreset(raw: unknown): DomesticModelPreset | null {
  if (!isPlainObject(raw)) return null
  const providerId = typeof raw.providerId === 'string' ? raw.providerId.trim() : ''
  if (!providerId) return null
  const defaultLabel =
    providerId.toLowerCase() === 'siliconflow' ? '主推 · 申请领免费额度' : '申请 API Key'
  return {
    providerId,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : providerId,
    category: normalizePresetCategory(raw.category),
    applyUrl: safeAnnouncementUrl(raw.applyUrl),
    customApplyUrl: safeAnnouncementUrl(raw.customApplyUrl),
    defaultApplyUrl: safeAnnouncementUrl(raw.defaultApplyUrl),
    applyLabel:
      typeof raw.applyLabel === 'string' && raw.applyLabel.trim()
        ? raw.applyLabel.trim()
        : defaultLabel,
    defaultModelId: normalizeOptionalString(raw.defaultModelId),
    defaultParams: normalizePlainParams(raw.defaultParams),
    featured: Boolean(raw.featured),
    enabled: raw.enabled !== false,
    updatedAt: normalizeNullableNumber(raw.updatedAt),
  }
}

export async function getCredits(
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<UserCreditsResponse> {
  const raw = await requestJson<Record<string, unknown>>(
    joinUrl(baseUrl, '/credits'),
    { method: 'GET' },
    fetchImpl,
  )
  const src = isPlainObject(raw) ? raw : {}
  const tier = normalizeMembershipTier(src.tier)
  const effectiveTier = src.effectiveTier !== undefined ? normalizeMembershipTier(src.effectiveTier) : tier
  const rawLedger = Array.isArray(src.ledger) ? src.ledger : []
  const ledger: CreditLedgerEntry[] = []
  for (const entry of rawLedger) {
    const normalized = normalizeCreditLedgerEntry(entry)
    if (normalized) ledger.push(normalized)
  }
  return {
    balance: Math.max(0, normalizeFiniteNumber(src.balance, 0)),
    tier,
    effectiveTier,
    tierExpiresAt: normalizeNullableNumber(src.tierExpiresAt),
    monthlyAllowance: Math.max(0, normalizeFiniteNumber(src.monthlyAllowance, 0)),
    currentMonth: typeof src.currentMonth === 'string' ? src.currentMonth.trim() : '',
    grantedThisMonth: Math.max(0, normalizeFiniteNumber(src.grantedThisMonth, 0)),
    monthlyCredits: normalizeMonthlyCredits(src.monthlyCredits),
    ledger,
  }
}

export async function getPlatformModels(
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<PublicPlatformModel[]> {
  const res = await requestJson<{ models?: unknown }>(
    joinUrl(baseUrl, '/platform-models'),
    { method: 'GET' },
    fetchImpl,
  )
  if (!isPlainObject(res) || !Array.isArray(res.models)) {
    return []
  }
  const items: PublicPlatformModel[] = []
  for (const entry of res.models) {
    const normalized = normalizePublicPlatformModel(entry)
    if (normalized) items.push(normalized)
  }
  return items.sort((a, b) => a.sortOrder - b.sortOrder)
}

export async function getModelPresets(
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<DomesticModelPreset[]> {
  const res = await requestJson<{ presets?: unknown }>(
    joinUrl(baseUrl, '/model-presets'),
    { method: 'GET' },
    fetchImpl,
  )
  if (!isPlainObject(res) || !Array.isArray(res.presets)) {
    return []
  }
  const items: DomesticModelPreset[] = []
  for (const entry of res.presets) {
    const normalized = normalizeDomesticModelPreset(entry)
    if (normalized) items.push(normalized)
  }
  return items
}
