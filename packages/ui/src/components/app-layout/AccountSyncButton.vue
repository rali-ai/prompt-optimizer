<template>
  <!--
    可选用户账号与云同步入口（仅当 /user-api/config 可达时显示）
    - 免登录可直接使用；云同步仅保存收藏、历史、模板和变量，模型 API Key 仅留在浏览器本地（BYOK）。
    - 扩展、桌面版或纯静态部署无 /user-api/ 时自动静默隐藏。
  -->
  <div v-if="available" class="account-sync-inline" :class="{ 'account-sync-inline--open': showModal }">
    <NButton
      quaternary
      size="small"
      class="account-sync-trigger"
      data-testid="header-account-sync"
      :aria-expanded="showModal"
      @click="togglePanel"
    >
      <template #icon>
        <NIcon :size="15" class="account-sync-icon"><Cloud :stroke-width="1.75" /></NIcon>
      </template>
      <span class="account-sync-trigger-body">
        <template v-if="currentUser">
          <span class="sync-status-dot" :class="{ 'sync-status-dot--synced': lastSyncVersion > 0 }" />
          <span class="account-sync-username">{{ currentUser.username }}</span>
        </template>
        <template v-else>
          <span class="account-sync-label">{{ text.triggerSignedOut }}</span>
        </template>
        <NIcon :size="14" class="account-sync-chevron" :class="{ 'account-sync-chevron--open': showModal }">
          <ChevronDown :stroke-width="1.75" />
        </NIcon>
      </span>
    </NButton>

    <a
      v-if="currentUser?.role === 'admin'"
      class="admin-sidebar-entry"
      :href="`${props.baseUrl}/admin`"
      target="_blank"
      rel="noopener noreferrer"
      data-testid="sidebar-admin-console-link"
      :title="isZh ? '用户与会员管理后台' : 'Admin Console'"
    >
      <NIcon :size="15" class="admin-sidebar-entry-icon"><ShieldCheck :stroke-width="1.75" /></NIcon>
      <span class="admin-sidebar-entry-label">{{ isZh ? '管理后台' : 'Admin' }}</span>
    </a>

    <div v-show="showModal" class="account-sync-drawer" data-testid="account-sync-inline-panel">
      <div class="byok-notice" data-testid="account-sync-byok-notice">
        {{ text.byokNotice }}
      </div>

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
        <NTabs v-model:value="activeTab" type="segment" size="small">
          <NTabPane name="login" :tab="text.tabLogin">
            <NForm label-placement="top" size="small" :show-feedback="false" class="auth-form" @submit.prevent="handleLogin">
              <NFormItem :label="text.loginIdentifierLabel" class="auth-field">
                <NInput
                  v-model:value="form.username"
                  size="small"
                  :placeholder="text.loginIdentifierPlaceholder"
                  :input-props="{ autocomplete: 'username' }"
                  data-testid="account-sync-login-username"
                />
              </NFormItem>
              <NFormItem :label="text.passwordLabel" class="auth-field">
                <NInput
                  v-model:value="form.password"
                  size="small"
                  type="password"
                  show-password-on="click"
                  :placeholder="text.passwordPlaceholder"
                  :input-props="{ autocomplete: 'current-password' }"
                  data-testid="account-sync-login-password"
                />
              </NFormItem>
              <NButton
                type="primary"
                size="small"
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
            <NForm label-placement="top" size="small" :show-feedback="false" class="auth-form" @submit.prevent="handleRegister">
              <NFormItem :label="text.usernameLabel" class="auth-field">
                <NInput
                  v-model:value="form.username"
                  size="small"
                  :placeholder="text.usernamePlaceholder"
                  :input-props="{ autocomplete: 'username' }"
                  data-testid="account-sync-register-username"
                />
              </NFormItem>
              <NFormItem :label="text.emailOptionalLabel" class="auth-field">
                <NInput
                  v-model:value="form.email"
                  size="small"
                  :placeholder="text.emailPlaceholder"
                  :input-props="{ type: 'email', autocomplete: 'email' }"
                  data-testid="account-sync-register-email"
                />
              </NFormItem>
              <NFormItem :label="text.passwordLabel" class="auth-field">
                <NInput
                  v-model:value="form.password"
                  size="small"
                  type="password"
                  show-password-on="click"
                  :placeholder="text.passwordPlaceholder"
                  :input-props="{ autocomplete: 'new-password' }"
                  data-testid="account-sync-register-password"
                />
              </NFormItem>
              <NFormItem :label="text.confirmPasswordLabel" class="auth-field">
                <NInput
                  v-model:value="form.confirmPassword"
                  size="small"
                  type="password"
                  show-password-on="click"
                  :placeholder="text.confirmPasswordPlaceholder"
                  :input-props="{ autocomplete: 'new-password' }"
                  data-testid="account-sync-register-confirm"
                />
              </NFormItem>
              <NButton
                type="primary"
                size="small"
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
        <div class="drawer-admin-footer">
          <a
            class="admin-console-link"
            :href="`${props.baseUrl}/admin`"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="drawer-admin-console-link"
          >
            {{ isZh ? '用户与会员管理后台 →' : 'User & Membership Admin →' }}
          </a>
        </div>
      </template>

      <template v-else>
        <div class="account-summary" data-testid="account-sync-summary">
          <div class="account-row">
            <strong>{{ currentUser.username }}</strong>
            <NTag v-if="membershipEnabled" size="small" :type="currentUser.tier === 'pro' ? 'info' : 'default'">
              {{ currentUser.tier === 'pro' ? 'Pro' : 'Free' }}
            </NTag>
          </div>
          <div class="account-row account-row--muted">
            <span class="account-email-text">{{ currentUser.email || text.emailUnbound }}</span>
          </div>
          <div class="account-row account-row--muted">
            <span>{{ syncSummaryText }}</span>
          </div>
        </div>

        <NSpace vertical :size="6" class="sync-actions">
          <a
            v-if="currentUser.role === 'admin'"
            class="admin-drawer-btn"
            :href="`${props.baseUrl}/admin`"
            target="_blank"
            rel="noopener noreferrer"
          >
            <NIcon :size="14"><ShieldCheck :stroke-width="1.75" /></NIcon>
            <span>{{ isZh ? '打开用户与会员管理后台' : 'Open Admin Console' }}</span>
          </a>
          <NButton
            type="primary"
            size="small"
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
            size="small"
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
            size="small"
            block
            :disabled="busy"
            data-testid="account-sync-security-toggle"
            @click="toggleSecurity"
          >
            {{ showSecurity ? text.hideSecurityButton : text.securityButton }}
          </NButton>
          <div v-if="showSecurity" class="security-subpanel" data-testid="account-sync-security-panel">
            <NForm label-placement="top" size="small" :show-feedback="false" class="auth-form" @submit.prevent="handleSaveEmail">
              <NFormItem :label="text.bindEmailLabel" class="auth-field">
                <NInput
                  v-model:value="securityForm.email"
                  size="small"
                  :placeholder="text.emailPlaceholder"
                  :input-props="{ type: 'email', autocomplete: 'email' }"
                  data-testid="account-sync-profile-email"
                />
              </NFormItem>
              <NButton
                secondary
                size="small"
                block
                :loading="busy && activeAction === 'profile'"
                :disabled="busy"
                data-testid="account-sync-save-email"
                @click="handleSaveEmail"
              >
                {{ text.saveEmailButton }}
              </NButton>
            </NForm>
            <div class="security-divider" />
            <NForm label-placement="top" size="small" :show-feedback="false" class="auth-form" @submit.prevent="handleChangePassword">
              <NFormItem :label="text.currentPasswordLabel" class="auth-field">
                <NInput
                  v-model:value="securityForm.currentPassword"
                  size="small"
                  type="password"
                  show-password-on="click"
                  :input-props="{ autocomplete: 'current-password' }"
                  data-testid="account-sync-current-password"
                />
              </NFormItem>
              <NFormItem :label="text.newPasswordLabel" class="auth-field">
                <NInput
                  v-model:value="securityForm.newPassword"
                  size="small"
                  type="password"
                  show-password-on="click"
                  :placeholder="text.passwordPlaceholder"
                  :input-props="{ autocomplete: 'new-password' }"
                  data-testid="account-sync-new-password"
                />
              </NFormItem>
              <NFormItem :label="text.confirmPasswordLabel" class="auth-field">
                <NInput
                  v-model:value="securityForm.confirmNewPassword"
                  size="small"
                  type="password"
                  show-password-on="click"
                  :placeholder="text.confirmPasswordPlaceholder"
                  :input-props="{ autocomplete: 'new-password' }"
                  data-testid="account-sync-confirm-new-password"
                />
              </NFormItem>
              <NButton
                secondary
                size="small"
                block
                :loading="busy && activeAction === 'password'"
                :disabled="busy"
                data-testid="account-sync-change-password"
                @click="handleChangePassword"
              >
                {{ text.changePasswordButton }}
              </NButton>
            </NForm>
          </div>
          <NButton
            quaternary
            type="error"
            size="small"
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, reactive, ref, type Ref } from 'vue'
import { i18n } from '../../plugins/i18n'
import {
  NAlert,
  NButton,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NSpace,
  NTabPane,
  NTabs,
  NTag,
} from 'naive-ui'
import { Cloud, ChevronDown, ShieldCheck } from '@lucide/vue'
import type { AppServices } from '../../types/services'
import {
  UserSyncError,
  changePassword,
  getConfig,
  getMe,
  login,
  logout,
  pullSync,
  pushSync,
  register,
  stripSecretsForSync,
  toDataManagerImportEnvelope,
  updateProfile,
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

const locale = computed(() => i18n.global.locale.value)
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
        loginIdentifierLabel: '用户名或邮箱',
        loginIdentifierPlaceholder: '输入用户名或已绑定邮箱',
        usernameLabel: '用户名',
        usernamePlaceholder: '3-32 位小写字母、数字、_ . -',
        emailOptionalLabel: '邮箱（选填，便于后续找回密码）',
        emailPlaceholder: 'name@example.com',
        emailUnbound: '邮箱：未绑定',
        bindEmailLabel: '绑定或修改邮箱',
        saveEmailButton: '保存邮箱',
        securityButton: '邮箱与修改密码',
        hideSecurityButton: '收起邮箱与改密',
        currentPasswordLabel: '当前密码',
        newPasswordLabel: '新密码',
        changePasswordButton: '更新密码',
        okEmailUpdated: '邮箱已保存',
        okPasswordChanged: '密码已更新，下次请使用新密码登录',
        errEmptyPasswordFields: '请输入当前密码和新密码',
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
        loginIdentifierLabel: 'Username or Email',
        loginIdentifierPlaceholder: 'Enter username or email',
        usernameLabel: 'Username',
        usernamePlaceholder: '3-32 chars: a-z, 0-9, _ . -',
        emailOptionalLabel: 'Email (optional, for recovery)',
        emailPlaceholder: 'name@example.com',
        emailUnbound: 'Email: Not set',
        bindEmailLabel: 'Email address',
        saveEmailButton: 'Save Email',
        securityButton: 'Email & Password',
        hideSecurityButton: 'Hide Security Settings',
        currentPasswordLabel: 'Current password',
        newPasswordLabel: 'New password',
        changePasswordButton: 'Update Password',
        okEmailUpdated: 'Email saved',
        okPasswordChanged: 'Password updated',
        errEmptyPasswordFields: 'Please enter current and new passwords',
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
const showSecurity = ref(false)
const activeTab = ref<'login' | 'register'>('login')
const busy = ref(false)
const activeAction = ref<'auth' | 'push' | 'pull' | 'logout' | 'profile' | 'password' | null>(null)
const notice = ref<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null)
const form = reactive({ username: '', email: '', password: '', confirmPassword: '' })
const securityForm = reactive({
  email: '',
  currentPassword: '',
  newPassword: '',
  confirmNewPassword: '',
})

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

function togglePanel() {
  if (!showModal.value) {
    notice.value = null
    form.password = ''
    form.confirmPassword = ''
    securityForm.email = currentUser.value?.email || ''
    getConfig(props.baseUrl)
      .then((cfg) => {
        membershipEnabled.value = Boolean(cfg.membershipEnabled)
      })
      .catch(() => {
        // ignore transient refresh errors
      })
  }
  showModal.value = !showModal.value
}

function toggleSecurity() {
  showSecurity.value = !showSecurity.value
  if (showSecurity.value) {
    securityForm.email = currentUser.value?.email || ''
    securityForm.currentPassword = ''
    securityForm.newPassword = ''
    securityForm.confirmNewPassword = ''
  }
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
    securityForm.email = currentUser.value?.email || ''
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
    currentUser.value = await register(
      form.username.trim(),
      form.password,
      props.baseUrl,
      fetch,
      form.email.trim() || undefined,
    )
    form.email = ''
    form.password = ''
    form.confirmPassword = ''
    securityForm.email = currentUser.value?.email || ''
    lastSyncVersion.value = 0
    lastSyncUpdatedAt.value = null
  } catch (err) {
    notice.value = { type: 'error', text: errorMessage(err) }
  } finally {
    busy.value = false
    activeAction.value = null
  }
}

async function handleSaveEmail() {
  if (busy.value || !currentUser.value) return
  busy.value = true
  activeAction.value = 'profile'
  notice.value = null
  try {
    const emailVal = securityForm.email.trim()
    currentUser.value = await updateProfile(emailVal || null, props.baseUrl)
    securityForm.email = currentUser.value.email || ''
    notice.value = { type: 'success', text: text.value.okEmailUpdated }
  } catch (err) {
    notice.value = { type: 'error', text: errorMessage(err) }
  } finally {
    busy.value = false
    activeAction.value = null
  }
}

async function handleChangePassword() {
  if (busy.value || !currentUser.value) return
  if (!securityForm.currentPassword || !securityForm.newPassword) {
    notice.value = { type: 'error', text: text.value.errEmptyPasswordFields }
    return
  }
  if (securityForm.newPassword.length < 8) {
    notice.value = { type: 'error', text: text.value.errPasswordShort }
    return
  }
  if (securityForm.newPassword !== securityForm.confirmNewPassword) {
    notice.value = { type: 'error', text: text.value.errPasswordMismatch }
    return
  }
  busy.value = true
  activeAction.value = 'password'
  notice.value = null
  try {
    currentUser.value = await changePassword(
      securityForm.currentPassword,
      securityForm.newPassword,
      props.baseUrl,
    )
    securityForm.currentPassword = ''
    securityForm.newPassword = ''
    securityForm.confirmNewPassword = ''
    notice.value = { type: 'success', text: text.value.okPasswordChanged }
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
    showSecurity.value = false
    securityForm.email = ''
    securityForm.currentPassword = ''
    securityForm.newPassword = ''
    securityForm.confirmNewPassword = ''
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
.account-sync-inline {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.account-sync-trigger {
  width: 100%;
  flex-shrink: 0;
  font-size: 13px;
  justify-content: flex-start;
}

.account-sync-trigger-body {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.account-sync-chevron {
  margin-left: auto;
  opacity: 0.65;
  transition: transform 160ms ease;
}

.account-sync-chevron--open {
  transform: rotate(180deg);
}

.account-sync-drawer {
  padding: 10px;
  border-radius: 12px;
  background: var(--gp-surface, var(--n-card-color, #ffffff));
  border: 1px solid var(--gp-border, var(--n-border-color, rgba(24, 24, 27, 0.09)));
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sync-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: var(--gp-copper, #d96b43);
  display: inline-block;
  flex-shrink: 0;
}

.sync-status-dot--synced {
  background-color: var(--gp-accent, #0f766e);
}

.account-sync-username {
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.byok-notice {
  font-size: 11px;
  line-height: 1.45;
  color: var(--gp-muted, #52525b);
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--gp-surface-muted, rgba(128, 128, 128, 0.08));
}

.sync-feedback {
  font-size: 12px;
}

.auth-form {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.auth-field {
  margin-bottom: 0;
}

.account-summary {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border-radius: 8px;
  background: var(--gp-surface-muted, rgba(128, 128, 128, 0.08));
  font-size: 12px;
}

.account-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.account-row--muted {
  font-size: 11px;
  color: var(--gp-muted, #52525b);
}

.admin-sidebar-entry {
  width: 100%;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding: 0 11px;
  border-radius: 10px;
  border: 1px solid var(--gp-border-strong, rgba(15, 118, 110, 0.34));
  background: var(--gp-accent-soft, rgba(15, 118, 110, 0.10));
  color: var(--gp-accent, #0f766e);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  box-sizing: border-box;
  transition: background-color 140ms ease, color 140ms ease;
}

.admin-sidebar-entry:hover {
  background: var(--gp-accent, #0f766e);
  color: #faf9f5;
}

.drawer-admin-footer {
  padding-top: 6px;
  border-top: 1px solid var(--gp-border, rgba(24, 24, 27, 0.08));
  display: flex;
  justify-content: flex-end;
}

.admin-drawer-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 28px;
  border-radius: 8px;
  border: 1px solid var(--gp-border-strong, rgba(15, 118, 110, 0.34));
  background: var(--gp-accent-soft, rgba(15, 118, 110, 0.10));
  color: var(--gp-accent, #0f766e);
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
  box-sizing: border-box;
}

.admin-drawer-btn:hover {
  background: var(--gp-accent, #0f766e);
  color: #faf9f5;
}

.admin-console-link {
  font-size: 11px;
  font-weight: 600;
  color: var(--gp-accent, #0f766e);
  text-decoration: none;
}

.admin-console-link:hover {
  text-decoration: underline;
}

.sync-actions {
  margin-top: 2px;
}

.account-email-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.security-subpanel {
  padding: 8px;
  border-radius: 8px;
  background: var(--gp-surface-muted, rgba(128, 128, 128, 0.06));
  border: 1px solid var(--gp-border, rgba(24, 24, 27, 0.08));
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.security-divider {
  height: 1px;
  background: var(--gp-border, rgba(24, 24, 27, 0.08));
}
</style>
