<template>
  <!--
    可选用户账号与云同步入口（仅当 /user-api/config 可达时显示）
    - 免登录可直接使用；云同步仅保存收藏、历史、模板和变量，模型 API Key 仅留在浏览器本地（BYOK）。
    - 扩展、桌面版或纯静态部署无 /user-api/ 时自动静默隐藏。
  -->
  <template v-if="available">
    <NButton
      quaternary
      size="small"
      class="account-sync-trigger"
      data-testid="header-account-sync"
      @click="openModal"
    >
      <template v-if="currentUser">
        <span class="sync-status-dot" :class="{ 'sync-status-dot--synced': lastSyncVersion > 0 }" />
        <span class="account-sync-username">{{ currentUser.username }}</span>
      </template>
      <template v-else>
        {{ text.triggerSignedOut }}
      </template>
    </NButton>

    <NModal
      v-model:show="showModal"
      preset="card"
      :title="currentUser ? text.modalTitleSignedIn : text.modalTitleSignedOut"
      :mask-closable="!busy"
      :closable="!busy"
      :style="{ width: 'min(440px, 92vw)' }"
    >
      <NAlert type="info" :show-icon="false" class="byok-notice" data-testid="account-sync-byok-notice">
        {{ text.byokNotice }}
      </NAlert>

      <NAlert
        v-if="notice"
        :type="notice.type"
        :show-icon="false"
        class="sync-feedback"
        data-testid="account-sync-feedback"
      >
        {{ notice.text }}
      </NAlert>

      <template v-if="!currentUser">
        <NTabs v-model:value="activeTab" type="segment" animated>
          <NTabPane name="login" :tab="text.tabLogin">
            <NForm label-placement="top" class="auth-form" @submit.prevent="handleLogin">
              <NFormItem :label="text.usernameLabel">
                <NInput
                  v-model:value="form.username"
                  :placeholder="text.usernamePlaceholder"
                  :input-props="{ autocomplete: 'username' }"
                  data-testid="account-sync-login-username"
                />
              </NFormItem>
              <NFormItem :label="text.passwordLabel">
                <NInput
                  v-model:value="form.password"
                  type="password"
                  show-password-on="click"
                  :placeholder="text.passwordPlaceholder"
                  :input-props="{ autocomplete: 'current-password' }"
                  data-testid="account-sync-login-password"
                />
              </NFormItem>
              <NButton
                type="primary"
                block
                :loading="busy"
                data-testid="account-sync-login-submit"
                @click="handleLogin"
              >
                {{ text.loginButton }}
              </NButton>
            </NForm>
          </NTabPane>

          <NTabPane name="register" :tab="text.tabRegister">
            <NForm label-placement="top" class="auth-form" @submit.prevent="handleRegister">
              <NFormItem :label="text.usernameLabel">
                <NInput
                  v-model:value="form.username"
                  :placeholder="text.usernamePlaceholder"
                  :input-props="{ autocomplete: 'username' }"
                  data-testid="account-sync-register-username"
                />
              </NFormItem>
              <NFormItem :label="text.passwordLabel">
                <NInput
                  v-model:value="form.password"
                  type="password"
                  show-password-on="click"
                  :placeholder="text.passwordPlaceholder"
                  :input-props="{ autocomplete: 'new-password' }"
                  data-testid="account-sync-register-password"
                />
              </NFormItem>
              <NFormItem :label="text.confirmPasswordLabel">
                <NInput
                  v-model:value="form.confirmPassword"
                  type="password"
                  show-password-on="click"
                  :placeholder="text.confirmPasswordPlaceholder"
                  :input-props="{ autocomplete: 'new-password' }"
                  data-testid="account-sync-register-confirm"
                />
              </NFormItem>
              <NButton
                type="primary"
                block
                :loading="busy"
                data-testid="account-sync-register-submit"
                @click="handleRegister"
              >
                {{ text.registerButton }}
              </NButton>
            </NForm>
          </NTabPane>
        </NTabs>
      </template>

      <template v-else>
        <div class="account-summary" data-testid="account-sync-summary">
          <div class="account-row">
            <span class="account-label">{{ text.currentAccount }}</span>
            <strong>{{ currentUser.username }}</strong>
            <NTag v-if="membershipEnabled" size="small" :type="currentUser.tier === 'pro' ? 'info' : 'default'">
              {{ currentUser.tier === 'pro' ? 'Pro' : 'Free' }}
            </NTag>
          </div>
          <div class="account-row">
            <span class="account-label">{{ text.syncStateLabel }}</span>
            <span>{{ syncSummaryText }}</span>
          </div>
        </div>

        <NSpace vertical :size="10" class="sync-actions">
          <NButton
            type="primary"
            block
            :loading="busy && activeAction === 'push'"
            :disabled="busy"
            data-testid="account-sync-push"
            @click="handlePush"
          >
            {{ text.pushButton }}
          </NButton>
          <NButton
            secondary
            block
            :loading="busy && activeAction === 'pull'"
            :disabled="busy"
            data-testid="account-sync-pull"
            @click="handlePull"
          >
            {{ text.pullButton }}
          </NButton>
          <NButton
            quaternary
            type="error"
            block
            :loading="busy && activeAction === 'logout'"
            :disabled="busy"
            data-testid="account-sync-logout"
            @click="handleLogout"
          >
            {{ text.logoutButton }}
          </NButton>
        </NSpace>
      </template>
    </NModal>
  </template>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, reactive, ref, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NAlert,
  NButton,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NSpace,
  NTabPane,
  NTabs,
  NTag,
} from 'naive-ui'
import type { AppServices } from '../../types/services'
import {
  UserSyncError,
  getConfig,
  getMe,
  login,
  logout,
  pullSync,
  pushSync,
  stripSecretsForSync,
  toDataManagerImportEnvelope,
  type SyncPayload,
  type SyncUser,
} from '../../utils/user-sync-client'

export interface AccountSyncButtonProps {
  baseUrl?: string
  onExportData?: () => Promise<Record<string, unknown>>
  onImportData?: (data: SyncPayload) => Promise<void>
}

const props = withDefaults(defineProps<AccountSyncButtonProps>(), {
  baseUrl: '/user-api',
})

const emit = defineEmits<{
  synced: [direction: 'push' | 'pull', version: number]
}>()

const { locale } = useI18n()
const services = inject<Ref<AppServices | null>>('services', ref(null))

const isZh = computed(() => String(locale.value || '').toLowerCase().startsWith('zh'))

const text = computed(() =>
  isZh.value
    ? {
        triggerSignedOut: '登录 / 云同步',
        modalTitleSignedOut: '登录 / 注册云同步',
        modalTitleSignedIn: '云同步与账号',
        byokNotice:
          '免登录也可直接使用；云同步仅保存收藏、历史、模板和变量，模型 API Key 仅留在您的浏览器本地。',
        tabLogin: '登录',
        tabRegister: '注册',
        usernameLabel: '用户名',
        usernamePlaceholder: '3-32 位小写字母、数字、_ . -',
        passwordLabel: '密码',
        passwordPlaceholder: '至少 8 位字符',
        confirmPasswordLabel: '确认密码',
        confirmPasswordPlaceholder: '再次输入密码',
        loginButton: '登录',
        registerButton: '注册并登录',
        currentAccount: '当前账号',
        syncStateLabel: '云端状态',
        neverSynced: '尚未同步',
        pushButton: '上传到云端',
        pullButton: '从云端拉取合并',
        logoutButton: '退出登录',
        errEmptyCreds: '请输入用户名和密码',
        errPasswordMismatch: '两次输入的密码不一致',
        errPasswordShort: '密码长度至少为 8 位',
        errNoDataService: '当前环境未挂载本地数据服务，无法导出或导入',
        okPushed: (v: number) => `已上传到云端（版本 v${v}），模型 API Key 未上传`,
        okPulledEmpty: '云端暂无已保存的数据',
        okPulled: (v: number) => `已从云端拉取合并（版本 v${v}），本地模型 Key 保持不变`,
        okLoggedOut: '已退出登录',
        errConflict: '云端已有更新版本，请先点击「从云端拉取合并」后再上传',
      }
    : {
        triggerSignedOut: 'Sign in / Sync',
        modalTitleSignedOut: 'Sign in / Cloud Sync',
        modalTitleSignedIn: 'Account & Cloud Sync',
        byokNotice:
          'Works without sign-in; cloud sync only saves favorites, history, templates, and variables. Model API keys always stay local in your browser.',
        tabLogin: 'Sign in',
        tabRegister: 'Register',
        usernameLabel: 'Username',
        usernamePlaceholder: '3-32 chars: a-z, 0-9, _ . -',
        passwordLabel: 'Password',
        passwordPlaceholder: 'At least 8 characters',
        confirmPasswordLabel: 'Confirm password',
        confirmPasswordPlaceholder: 'Re-enter password',
        loginButton: 'Sign in',
        registerButton: 'Create account',
        currentAccount: 'Account',
        syncStateLabel: 'Cloud state',
        neverSynced: 'Not synced yet',
        pushButton: 'Upload to Cloud',
        pullButton: 'Pull & Merge from Cloud',
        logoutButton: 'Sign Out',
        errEmptyCreds: 'Please enter username and password',
        errPasswordMismatch: 'Passwords do not match',
        errPasswordShort: 'Password must be at least 8 characters',
        errNoDataService: 'Local data service is unavailable in this environment',
        okPushed: (v: number) => `Uploaded to cloud (v${v}). Model API keys were not uploaded.`,
        okPulledEmpty: 'No cloud backup found yet.',
        okPulled: (v: number) => `Pulled & merged from cloud (v${v}). Local API keys untouched.`,
        okLoggedOut: 'Signed out',
        errConflict: 'Cloud has a newer version. Please pull & merge first before uploading.',
      },
)

const available = ref(false)
const membershipEnabled = ref(false)
const currentUser = ref<SyncUser | null>(null)
const lastSyncVersion = ref(0)
const lastSyncUpdatedAt = ref<number | null>(null)

const showModal = ref(false)
const activeTab = ref<'login' | 'register'>('login')
const busy = ref(false)
const activeAction = ref<'auth' | 'push' | 'pull' | 'logout' | null>(null)
const notice = ref<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null)
const form = reactive({ username: '', password: '', confirmPassword: '' })

const syncSummaryText = computed(() => {
  if (!lastSyncVersion.value || !lastSyncUpdatedAt.value) {
    return text.value.neverSynced
  }
  const timeStr = new Date(lastSyncUpdatedAt.value).toLocaleString()
  return `v${lastSyncVersion.value} · ${timeStr}`
})

async function refreshSyncMeta() {
  try {
    const meta = await pullSync(props.baseUrl)
    lastSyncVersion.value = meta.version
    lastSyncUpdatedAt.value = meta.updatedAt
  } catch {
    // Keep last known metadata silently.
  }
}

onMounted(async () => {
  try {
    const cfg = await getConfig(props.baseUrl)
    available.value = true
    membershipEnabled.value = Boolean(cfg.membershipEnabled)
    const user = await getMe(props.baseUrl)
    currentUser.value = user
    if (user) {
      await refreshSyncMeta()
    }
  } catch {
    // /user-api is absent (desktop, extension, static build): stay hidden cleanly.
    available.value = false
  }
})

function openModal() {
  notice.value = null
  form.password = ''
  form.confirmPassword = ''
  showModal.value = true
}

function errorMessage(err: unknown): string {
  if (err instanceof UserSyncError) {
    if (err.status === 409) return text.value.errConflict
    return err.message
  }
  return err instanceof Error ? err.message : String(err)
}

async function handleLogin() {
  if (busy.value) return
  if (!form.username.trim() || !form.password) {
    notice.value = { type: 'error', text: text.value.errEmptyCreds }
    return
  }
  busy.value = true
  activeAction.value = 'auth'
  notice.value = null
  try {
    currentUser.value = await login(form.username.trim(), form.password, props.baseUrl)
    form.password = ''
    await refreshSyncMeta()
  } catch (err) {
    notice.value = { type: 'error', text: errorMessage(err) }
  } finally {
    busy.value = false
    activeAction.value = null
  }
}

async function handleRegister() {
  if (busy.value) return
  if (!form.username.trim() || !form.password) {
    notice.value = { type: 'error', text: text.value.errEmptyCreds }
    return
  }
  if (form.password.length < 8) {
    notice.value = { type: 'error', text: text.value.errPasswordShort }
    return
  }
  if (form.password !== form.confirmPassword) {
    notice.value = { type: 'error', text: text.value.errPasswordMismatch }
    return
  }
  busy.value = true
  activeAction.value = 'auth'
  notice.value = null
  try {
    currentUser.value = await register(form.username.trim(), form.password, props.baseUrl)
    form.password = ''
    form.confirmPassword = ''
    lastSyncVersion.value = 0
    lastSyncUpdatedAt.value = null
  } catch (err) {
    notice.value = { type: 'error', text: errorMessage(err) }
  } finally {
    busy.value = false
    activeAction.value = null
  }
}

async function collectLocalData(): Promise<SyncPayload> {
  if (props.onExportData) {
    return stripSecretsForSync(await props.onExportData())
  }
  const appServices = services?.value
  if (!appServices?.dataManager) {
    throw new Error(text.value.errNoDataService)
  }
  const rawJson = await appServices.dataManager.exportAllData()
  const parsed = JSON.parse(rawJson) as Record<string, unknown>
  const favManager = appServices.favoriteManager as
    | { exportFavorites?: () => Promise<string | unknown> }
    | undefined
  if (favManager?.exportFavorites) {
    const rawFav = await favManager.exportFavorites()
    parsed.favorites = typeof rawFav === 'string' ? JSON.parse(rawFav) : rawFav
  }
  return stripSecretsForSync(parsed)
}

async function applyPulledData(payload: SyncPayload): Promise<void> {
  if (props.onImportData) {
    await props.onImportData(payload)
    return
  }
  const appServices = services?.value
  if (!appServices?.dataManager) {
    throw new Error(text.value.errNoDataService)
  }
  const envelope = toDataManagerImportEnvelope(payload)
  if (envelope) {
    await appServices.dataManager.importAllData(JSON.stringify(envelope))
  }
  const favManager = appServices.favoriteManager as
    | { importFavorites?: (data: string, options?: { mergeStrategy?: string }) => Promise<unknown> }
    | undefined
  if (payload.favorites !== undefined && favManager?.importFavorites) {
    const serialized =
      typeof payload.favorites === 'string' ? payload.favorites : JSON.stringify(payload.favorites)
    await favManager.importFavorites(serialized, { mergeStrategy: 'merge' })
  }
}

async function handlePush() {
  if (busy.value || !currentUser.value) return
  busy.value = true
  activeAction.value = 'push'
  notice.value = null
  try {
    const payload = await collectLocalData()
    const res = await pushSync(payload, lastSyncVersion.value, props.baseUrl)
    lastSyncVersion.value = res.version
    lastSyncUpdatedAt.value = res.updatedAt
    notice.value = { type: 'success', text: text.value.okPushed(res.version) }
    emit('synced', 'push', res.version)
  } catch (err) {
    notice.value = { type: 'error', text: errorMessage(err) }
  } finally {
    busy.value = false
    activeAction.value = null
  }
}

async function handlePull() {
  if (busy.value || !currentUser.value) return
  busy.value = true
  activeAction.value = 'pull'
  notice.value = null
  try {
    const res = await pullSync(props.baseUrl)
    lastSyncVersion.value = res.version
    lastSyncUpdatedAt.value = res.updatedAt
    if (!res.data || res.version === 0) {
      notice.value = { type: 'warning', text: text.value.okPulledEmpty }
      return
    }
    await applyPulledData(res.data)
    notice.value = { type: 'success', text: text.value.okPulled(res.version) }
    emit('synced', 'pull', res.version)
  } catch (err) {
    notice.value = { type: 'error', text: errorMessage(err) }
  } finally {
    busy.value = false
    activeAction.value = null
  }
}

async function handleLogout() {
  if (busy.value) return
  busy.value = true
  activeAction.value = 'logout'
  notice.value = null
  try {
    await logout(props.baseUrl)
    currentUser.value = null
    lastSyncVersion.value = 0
    lastSyncUpdatedAt.value = null
    notice.value = { type: 'success', text: text.value.okLoggedOut }
  } catch (err) {
    notice.value = { type: 'error', text: errorMessage(err) }
  } finally {
    busy.value = false
    activeAction.value = null
  }
}
</script>

<style scoped>
.account-sync-trigger {
  flex-shrink: 0;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.sync-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: var(--n-warning-color, #f0a020);
  display: inline-block;
  margin-right: 5px;
}

.sync-status-dot--synced {
  background-color: var(--n-success-color, #18a058);
}

.account-sync-username {
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.byok-notice {
  margin-bottom: 12px;
  font-size: 12px;
}

.sync-feedback {
  margin-bottom: 12px;
}

.auth-form {
  margin-top: 10px;
}

.account-summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 8px;
  background: var(--n-color-embedded, rgba(128, 128, 128, 0.08));
  margin-bottom: 14px;
  font-size: 13px;
}

.account-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.account-label {
  color: var(--n-text-color-3, #888);
  min-width: 68px;
}

.sync-actions {
  margin-top: 4px;
}
</style>
