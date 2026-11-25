export interface UserSyncConfig {
  membershipEnabled: boolean
  registrationEnabled: boolean
  emailResetEnabled?: boolean
}

export interface SyncUser {
  id: string
  username: string
  email?: string | null
  role: 'user' | 'admin'
  tier: 'free' | 'pro'
  tierExpiresAt: number | null
  disabled: boolean
  createdAt: number
  updatedAt: number
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
  createdAt: number
  updatedAt: number
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
