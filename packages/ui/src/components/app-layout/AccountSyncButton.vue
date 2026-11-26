<template>
  <!--
    可选用户账号与云同步入口（仅当 /user-api/config 可达时显示）
    - 免登录可直接使用；云同步仅保存收藏、历史、模板和变量，模型 API Key 仅留在浏览器本地（BYOK）。
    - 扩展、桌面版或纯静态部署无 /user-api/ 时自动静默隐藏。
  -->
  <div v-if="available" ref="rootEl" class="account-sync-inline" :class="{ 'account-sync-inline--open': showModal }">
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
            <NForm
              v-if="!showForgotReset"
              label-placement="top"
              size="small"
              :show-feedback="false"
              class="auth-form"
              @submit.prevent="handleLogin"
            >
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
              <div v-if="emailResetEnabled" class="forgot-link-row">
                <button
                  type="button"
                  class="inline-text-btn"
                  data-testid="account-sync-forgot-toggle"
                  @click="openForgotReset"
                >
                  {{ text.forgotPasswordLink }}
                </button>
              </div>
            </NForm>

            <NForm
              v-else
              label-placement="top"
              size="small"
              :show-feedback="false"
              class="auth-form"
              data-testid="account-sync-reset-form"
              @submit.prevent="handleConfirmReset"
            >
              <NFormItem :label="text.resetEmailLabel" class="auth-field">
                <NInput
                  v-model:value="resetForm.email"
                  size="small"
                  :placeholder="text.emailPlaceholder"
                  :input-props="{ type: 'email', autocomplete: 'email' }"
                  data-testid="account-sync-reset-email"
                />
              </NFormItem>
              <div class="reset-code-bar">
                <NInput
                  v-model:value="resetForm.code"
                  size="small"
                  :maxlength="6"
                  :placeholder="text.resetCodePlaceholder"
                  :input-props="{ inputmode: 'numeric', autocomplete: 'one-time-code' }"
                  data-testid="account-sync-reset-code"
                />
                <NButton
                  secondary
                  size="small"
                  :loading="busy && activeAction === 'reset-send'"
                  :disabled="busy || resetCooldownSec > 0"
                  data-testid="account-sync-reset-send"
                  @click="handleRequestResetCode"
                >
                  {{ resetCooldownSec > 0 ? `${resetCooldownSec}s` : text.sendResetCodeButton }}
                </NButton>
              </div>
              <NFormItem :label="text.newPasswordLabel" class="auth-field">
                <NInput
                  v-model:value="resetForm.newPassword"
                  size="small"
                  type="password"
                  show-password-on="click"
                  :placeholder="text.passwordPlaceholder"
                  :input-props="{ autocomplete: 'new-password' }"
                  data-testid="account-sync-reset-new-password"
                />
              </NFormItem>
              <NFormItem :label="text.confirmPasswordLabel" class="auth-field">
                <NInput
                  v-model:value="resetForm.confirmNewPassword"
                  size="small"
                  type="password"
                  show-password-on="click"
                  :placeholder="text.confirmPasswordPlaceholder"
                  :input-props="{ autocomplete: 'new-password' }"
                  data-testid="account-sync-reset-confirm-password"
                />
              </NFormItem>
              <NButton
                type="primary"
                size="small"
                block
                :loading="busy && activeAction === 'reset-confirm'"
                :disabled="busy"
                data-testid="account-sync-reset-submit"
                @click="handleConfirmReset"
              >
                {{ text.confirmResetButton }}
              </NButton>
              <div class="forgot-link-row">
                <button
                  type="button"
                  class="inline-text-btn"
                  @click="showForgotReset = false"
                >
                  {{ text.backToLoginLink }}
                </button>
              </div>
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
            <NTag
              v-if="showTierBadge"
              size="small"
              :type="tierTagType(effectiveTier)"
              data-testid="account-sync-tier-badge"
            >
              {{ formatTierLabel(effectiveTier, isZh) }}
            </NTag>
          </div>
          <div class="account-row account-row--muted">
            <span class="account-email-text">{{ currentUser.email || text.emailUnbound }}</span>
          </div>
          <div v-if="tierExpiresText" class="account-row account-row--muted">
            <span>{{ tierExpiresText }}</span>
          </div>
          <div class="account-row account-row--muted">
            <span>{{ syncSummaryText }}</span>
          </div>
        </div>

        <div class="credits-card" data-testid="account-sync-credits-card">
          <div class="credits-card-header">
            <span class="credits-card-title">{{ text.creditsTitle }}</span>
            <NButton
              quaternary
              size="tiny"
              :loading="loadingCredits"
              data-testid="account-sync-refresh-credits"
              :title="text.refreshCredits"
              @click="handleRefreshCredits"
            >
              <template #icon>
                <NIcon :size="12"><RefreshCw :stroke-width="1.75" /></NIcon>
              </template>
              {{ text.refreshCredits }}
            </NButton>
          </div>
          <div class="credits-balance-row">
            <span class="credits-balance-label">{{ text.availableCredits }}</span>
            <strong class="credits-balance-value" data-testid="account-sync-credit-balance">
              {{ displayCreditBalance }}
            </strong>
          </div>
          <div v-if="credits" class="credits-quota-row">
            <span>{{ monthlyQuotaText }}</span>
          </div>
          <div class="credits-hint">
            {{ creditsHintText }}
          </div>
          <div v-if="credits" class="credits-ledger-section">
            <button
              type="button"
              class="inline-text-btn credits-ledger-toggle"
              data-testid="account-sync-ledger-toggle"
              @click="showCreditLedger = !showCreditLedger"
            >
              <span>{{ showCreditLedger ? text.hideLedger : `${text.showLedger} (${credits.ledger.length})` }}</span>
              <NIcon :size="12" class="credits-ledger-chevron" :class="{ 'credits-ledger-chevron--open': showCreditLedger }">
                <ChevronDown :stroke-width="1.75" />
              </NIcon>
            </button>
            <div v-if="showCreditLedger" class="credits-ledger-list" data-testid="account-sync-ledger-list">
              <div v-if="credits.ledger.length === 0" class="credits-ledger-empty">
                {{ text.ledgerEmpty }}
              </div>
              <div
                v-for="entry in credits.ledger"
                :key="entry.id"
                class="credits-ledger-item"
              >
                <div class="credits-ledger-item-main">
                  <span class="credits-ledger-reason">{{ formatLedgerReason(entry.reason) }}</span>
                  <span
                    class="credits-ledger-delta"
                    :class="entry.delta >= 0 ? 'credits-ledger-delta--plus' : 'credits-ledger-delta--minus'"
                  >
                    {{ entry.delta >= 0 ? `+${entry.delta}` : entry.delta }}
                  </span>
                </div>
                <div class="credits-ledger-item-meta">
                  <span v-if="entry.modelId || entry.note" class="credits-ledger-note">
                    {{ entry.modelId || entry.note }}
                  </span>
                  <span>{{ formatLedgerTime(entry.createdAt) }}</span>
                  <span>{{ text.balanceAfterLabel(entry.balanceAfter) }}</span>
                </div>
              </div>
            </div>
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
              <div v-if="needsEmailVerification" class="reset-code-bar">
                <NInput
                  v-model:value="securityForm.emailVerifyCode"
                  size="small"
                  :maxlength="6"
                  :placeholder="text.emailVerifyCodePlaceholder"
                  :input-props="{ inputmode: 'numeric', autocomplete: 'one-time-code' }"
                  data-testid="account-sync-email-verify-code"
                />
                <NButton
                  secondary
                  size="small"
                  :loading="busy && activeAction === 'email-verify-send'"
                  :disabled="busy || emailCodeCooldownSec > 0"
                  data-testid="account-sync-email-verify-send"
                  @click="handleRequestEmailVerifyCode"
                >
                  {{ emailCodeCooldownSec > 0 ? `${emailCodeCooldownSec}s` : text.sendEmailVerifyCodeButton }}
                </NButton>
              </div>
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
import { computed, inject, onMounted, onUnmounted, reactive, ref, watch, type Ref } from 'vue'
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
import { Cloud, ChevronDown, RefreshCw, ShieldCheck } from '@lucide/vue'
import type { AppServices } from '../../types/services'
import {
  UserSyncError,
  changePassword,
  confirmPasswordReset,
  getConfig,
  getMe,
  login,
  logout,
  pullSync,
  pushSync,
  register,
  requestEmailVerifyCode,
  requestPasswordReset,
  resolveDefaultSyncBaseUrl,
  stripSecretsForSync,
  toDataManagerImportEnvelope,
  updateProfile,
  type MembershipTier,
  type MonthlyCreditsConfig,
  type SyncPayload,
  type SyncUser,
} from '../../utils/user-sync-client'
import {
  formatTierLabel,
  tierTagType,
  usePlatformModelCatalog,
} from '../../composables/model/usePlatformModelCatalog'

export interface AccountSyncButtonProps {
  baseUrl?: string
  onExportData?: () => Promise<Record<string, unknown>>
  onImportData?: (data: SyncPayload) => Promise<void>
}

const props = withDefaults(defineProps<AccountSyncButtonProps>(), {
  baseUrl: () => resolveDefaultSyncBaseUrl(),
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
        emailVerifyCodePlaceholder: '6 位邮箱验证码',
        sendEmailVerifyCodeButton: '发送验证码',
        errEmailVerifyRequired: '请输入要绑定的邮箱地址',
        errEmailVerifyCodeRequired: '请输入 6 位数字验证码',
        okEmailVerifySent: '验证码已发送至新邮箱，请查收邮件（含垃圾箱）',
        securityButton: '邮箱与修改密码',
        hideSecurityButton: '收起邮箱与改密',
        currentPasswordLabel: '当前密码',
        newPasswordLabel: '新密码',
        changePasswordButton: '更新密码',
        okEmailUpdated: '邮箱已保存',
        okPasswordChanged: '密码已更新，下次请使用新密码登录',
        errEmptyPasswordFields: '请输入当前密码和新密码',
        forgotPasswordLink: '忘记密码？用邮箱重置',
        backToLoginLink: '← 返回账号登录',
        resetEmailLabel: '已绑定邮箱',
        resetCodePlaceholder: '6 位验证码',
        sendResetCodeButton: '发验证码',
        confirmResetButton: '确认重置密码',
        errResetEmailRequired: '请输入已绑定的邮箱地址',
        errResetCodeRequired: '请输入 6 位数字验证码',
        okResetSent: '验证码已发送，请查收邮件（含垃圾箱）',
        okResetDone: '密码已重置，请使用新密码登录',
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
        creditsTitle: '网站积分',
        refreshCredits: '刷新',
        availableCredits: '可用积分',
        showLedger: '积分明细',
        hideLedger: '收起积分明细',
        ledgerEmpty: '暂无积分变动记录',
        balanceAfterLabel: (v: number) => `余 ${v}`,
        tierExpiresPrefix: '会员到期：',
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
        emailVerifyCodePlaceholder: '6-digit email code',
        sendEmailVerifyCodeButton: 'Send code',
        errEmailVerifyRequired: 'Please enter the email address to bind',
        errEmailVerifyCodeRequired: 'Please enter the 6-digit verification code',
        okEmailVerifySent: 'Verification code sent to the new email. Check your inbox (and spam folder).',
        securityButton: 'Email & Password',
        hideSecurityButton: 'Hide Security Settings',
        currentPasswordLabel: 'Current password',
        newPasswordLabel: 'New password',
        changePasswordButton: 'Update Password',
        okEmailUpdated: 'Email saved',
        okPasswordChanged: 'Password updated',
        errEmptyPasswordFields: 'Please enter current and new passwords',
        forgotPasswordLink: 'Forgot password? Reset via email',
        backToLoginLink: '← Back to sign in',
        resetEmailLabel: 'Bound email',
        resetCodePlaceholder: '6-digit code',
        sendResetCodeButton: 'Send code',
        confirmResetButton: 'Reset password',
        errResetEmailRequired: 'Please enter your bound email address',
        errResetCodeRequired: 'Please enter the 6-digit verification code',
        okResetSent: 'Verification code sent. Check your inbox (and spam folder).',
        okResetDone: 'Password reset. Please sign in with your new password.',
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
        creditsTitle: 'Site Credits',
        refreshCredits: 'Refresh',
        availableCredits: 'Available credits',
        showLedger: 'Credit ledger',
        hideLedger: 'Hide ledger',
        ledgerEmpty: 'No credit transactions yet',
        balanceAfterLabel: (v: number) => `Bal ${v}`,
        tierExpiresPrefix: 'Expires: ',
      },
)

const platformCatalog = usePlatformModelCatalog()
const { credits, loadingCredits } = platformCatalog

const available = ref(false)
const membershipEnabled = ref(false)
const emailResetEnabled = ref(false)
const emailVerificationRequired = ref(false)
const monthlyCreditsConfig = ref<MonthlyCreditsConfig | null>(null)
const currentUser = ref<SyncUser | null>(null)
const lastSyncVersion = ref(0)
const lastSyncUpdatedAt = ref<number | null>(null)

const rootEl = ref<HTMLElement | null>(null)
const showModal = ref(false)
const showSecurity = ref(false)
const showCreditLedger = ref(false)
const showForgotReset = ref(false)
const resetCooldownSec = ref(0)
let resetCooldownTimer: ReturnType<typeof setInterval> | null = null
const emailCodeCooldownSec = ref(0)
let emailCodeCooldownTimer: ReturnType<typeof setInterval> | null = null
const activeTab = ref<'login' | 'register'>('login')
const busy = ref(false)
const activeAction = ref<
  'auth' | 'push' | 'pull' | 'logout' | 'profile' | 'password' | 'reset-send' | 'reset-confirm' | 'email-verify-send' | null
>(null)
const notice = ref<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null)
const form = reactive({ username: '', email: '', password: '', confirmPassword: '' })
const securityForm = reactive({
  email: '',
  emailVerifyCode: '',
  currentPassword: '',
  newPassword: '',
  confirmNewPassword: '',
})

const needsEmailVerification = computed(() => {
  if (!emailVerificationRequired.value) return false
  const nextEmail = securityForm.email.trim().toLowerCase()
  if (!nextEmail) return false
  const currentEmail = (currentUser.value?.email || '').trim().toLowerCase()
  return nextEmail !== currentEmail
})
const resetForm = reactive({
  email: '',
  code: '',
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

const effectiveTier = computed<MembershipTier>(
  () => credits.value?.effectiveTier || currentUser.value?.effectiveTier || currentUser.value?.tier || 'free',
)

const showTierBadge = computed(() => {
  if (!currentUser.value) return false
  return membershipEnabled.value || effectiveTier.value !== 'free' || credits.value !== null
})

const tierExpiresText = computed(() => {
  const expiresAt = credits.value?.tierExpiresAt ?? currentUser.value?.tierExpiresAt ?? null
  if (!expiresAt || expiresAt <= 0) return ''
  return `${text.value.tierExpiresPrefix}${new Date(expiresAt).toLocaleDateString()}`
})

const displayCreditBalance = computed(() => {
  if (credits.value) return credits.value.balance
  if (typeof currentUser.value?.creditBalance === 'number') return currentUser.value.creditBalance
  return 0
})

const monthlyQuotaText = computed(() => {
  if (!credits.value) return ''
  const { grantedThisMonth, monthlyAllowance } = credits.value
  return isZh.value
    ? `本月额度：已赠 ${grantedThisMonth} / ${monthlyAllowance}`
    : `Monthly quota: ${grantedThisMonth} / ${monthlyAllowance} granted`
})

const creditsHintText = computed(() => {
  const mc = credits.value?.monthlyCredits || monthlyCreditsConfig.value || {
    free: 0,
    standard: 100,
    pro: 500,
    internal: 1000,
  }
  return isZh.value
    ? `会员每月自动获赠积分（标准 ${mc.standard} / 专业 ${mc.pro} / 内部 ${mc.internal}），可在模型列表中直接使用网站提供的平台模型，也可随时添加自己的 API Key（仅存本地）。`
    : `Members get monthly credits (Standard ${mc.standard} / Pro ${mc.pro} / Internal ${mc.internal}) for platform-hosted models. You can also add your own local API keys anytime.`
})

function formatLedgerReason(reason: string): string {
  const labelsZh: Record<string, string> = {
    monthly_grant: '月度赠送',
    tier_upgrade_grant: '升级补差',
    usage_debit: '模型调用',
    model_usage: '模型调用',
    usage_refund: '调用退还',
    admin_adjust: '后台调整',
  }
  const labelsEn: Record<string, string> = {
    monthly_grant: 'Monthly grant',
    tier_upgrade_grant: 'Upgrade grant',
    usage_debit: 'Model usage',
    model_usage: 'Model usage',
    usage_refund: 'Usage refund',
    admin_adjust: 'Admin adjust',
  }
  return (isZh.value ? labelsZh[reason] : labelsEn[reason]) || reason
}

function formatLedgerTime(ts: number): string {
  if (!ts || !Number.isFinite(ts)) return ''
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

async function refreshCreditsAndPlatformModels(loggedIn: boolean) {
  if (!loggedIn) {
    if (services?.value?.modelManager) {
      await platformCatalog.syncUserPlatformModels(services.value.modelManager, props.baseUrl, false)
    }
    return
  }
  const [creditRes] = await Promise.all([
    platformCatalog.loadUserCredits(props.baseUrl),
    services?.value?.modelManager
      ? platformCatalog.syncUserPlatformModels(services.value.modelManager, props.baseUrl, true)
      : platformCatalog.loadPlatformModels(props.baseUrl, true),
  ])
  if (creditRes && currentUser.value) {
    currentUser.value = {
      ...currentUser.value,
      tier: creditRes.tier,
      effectiveTier: creditRes.effectiveTier,
      tierExpiresAt: creditRes.tierExpiresAt,
      creditBalance: creditRes.balance,
    }
  }
}

async function handleRefreshCredits() {
  if (!currentUser.value || loadingCredits.value) return
  await refreshCreditsAndPlatformModels(true)
}

watch(
  () => services?.value?.modelManager,
  (modelManager) => {
    if (modelManager && currentUser.value) {
      void platformCatalog.syncUserPlatformModels(modelManager, props.baseUrl, true)
    }
  },
)

async function refreshSyncMeta() {
  try {
    const meta = await pullSync(props.baseUrl)
    lastSyncVersion.value = meta.version
    lastSyncUpdatedAt.value = meta.updatedAt
  } catch {
    // Keep last known metadata silently.
  }
}

function dispatchAuthChanged(user: SyncUser | null) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('goprmpt:auth-changed', { detail: { user } }))
}

function handleOpenAccountPanel(event: Event) {
  if (!available.value) return
  const detail = (event as CustomEvent<{ tab?: 'login' | 'register' }> | undefined)?.detail
  if (detail?.tab === 'login' || detail?.tab === 'register') {
    activeTab.value = detail.tab
  }
  showForgotReset.value = false
  if (!showModal.value) {
    openPanel()
  }
  rootEl.value?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
}

onMounted(async () => {
  if (typeof window !== 'undefined') {
    window.addEventListener('goprmpt:open-account-panel', handleOpenAccountPanel)
  }
  try {
    const cfg = await getConfig(props.baseUrl)
    available.value = true
    membershipEnabled.value = Boolean(cfg.membershipEnabled)
    emailResetEnabled.value = Boolean(cfg.emailResetEnabled)
    emailVerificationRequired.value = Boolean(cfg.emailVerificationRequired ?? cfg.emailResetEnabled)
    monthlyCreditsConfig.value = cfg.monthlyCredits || null
    const user = await getMe(props.baseUrl)
    currentUser.value = user
    dispatchAuthChanged(currentUser.value)
    if (user) {
      await Promise.all([refreshSyncMeta(), refreshCreditsAndPlatformModels(true)])
    } else {
      await refreshCreditsAndPlatformModels(false)
    }
  } catch {
    // /user-api is absent (desktop, extension, static build): stay hidden cleanly.
    available.value = false
  }
})

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('goprmpt:open-account-panel', handleOpenAccountPanel)
  }
  if (resetCooldownTimer) {
    clearInterval(resetCooldownTimer)
    resetCooldownTimer = null
  }
  if (emailCodeCooldownTimer) {
    clearInterval(emailCodeCooldownTimer)
    emailCodeCooldownTimer = null
  }
})

function startEmailCodeCooldown(seconds = 60) {
  emailCodeCooldownSec.value = seconds
  if (emailCodeCooldownTimer) clearInterval(emailCodeCooldownTimer)
  emailCodeCooldownTimer = setInterval(() => {
    if (emailCodeCooldownSec.value <= 1) {
      emailCodeCooldownSec.value = 0
      if (emailCodeCooldownTimer) {
        clearInterval(emailCodeCooldownTimer)
        emailCodeCooldownTimer = null
      }
    } else {
      emailCodeCooldownSec.value -= 1
    }
  }, 1000)
}

function startResetCooldown(seconds = 60) {
  resetCooldownSec.value = seconds
  if (resetCooldownTimer) clearInterval(resetCooldownTimer)
  resetCooldownTimer = setInterval(() => {
    if (resetCooldownSec.value <= 1) {
      resetCooldownSec.value = 0
      if (resetCooldownTimer) {
        clearInterval(resetCooldownTimer)
        resetCooldownTimer = null
      }
    } else {
      resetCooldownSec.value -= 1
    }
  }, 1000)
}

function openForgotReset() {
  notice.value = null
  showForgotReset.value = true
  if (form.username.includes('@') && !resetForm.email) {
    resetForm.email = form.username.trim()
  }
}

async function handleRequestResetCode() {
  if (busy.value || resetCooldownSec.value > 0) return
  const email = resetForm.email.trim()
  if (!email) {
    notice.value = { type: 'error', text: text.value.errResetEmailRequired }
    return
  }
  busy.value = true
  activeAction.value = 'reset-send'
  notice.value = null
  try {
    const res = await requestPasswordReset(email, props.baseUrl)
    notice.value = { type: 'success', text: res.message || text.value.okResetSent }
    startResetCooldown(60)
  } catch (err) {
    notice.value = { type: 'error', text: errorMessage(err) }
  } finally {
    busy.value = false
    activeAction.value = null
  }
}

async function handleConfirmReset() {
  if (busy.value) return
  const email = resetForm.email.trim()
  const code = resetForm.code.trim()
  if (!email) {
    notice.value = { type: 'error', text: text.value.errResetEmailRequired }
    return
  }
  if (!/^\d{6}$/.test(code)) {
    notice.value = { type: 'error', text: text.value.errResetCodeRequired }
    return
  }
  if (resetForm.newPassword.length < 8) {
    notice.value = { type: 'error', text: text.value.errPasswordShort }
    return
  }
  if (resetForm.newPassword !== resetForm.confirmNewPassword) {
    notice.value = { type: 'error', text: text.value.errPasswordMismatch }
    return
  }
  busy.value = true
  activeAction.value = 'reset-confirm'
  notice.value = null
  try {
    const res = await confirmPasswordReset(email, code, resetForm.newPassword, props.baseUrl)
    form.username = email
    form.password = ''
    resetForm.code = ''
    resetForm.newPassword = ''
    resetForm.confirmNewPassword = ''
    showForgotReset.value = false
    notice.value = { type: 'success', text: res.message || text.value.okResetDone }
  } catch (err) {
    notice.value = { type: 'error', text: errorMessage(err) }
  } finally {
    busy.value = false
    activeAction.value = null
  }
}

function openPanel() {
  notice.value = null
  form.password = ''
  form.confirmPassword = ''
  securityForm.email = currentUser.value?.email || ''
  securityForm.emailVerifyCode = ''
  getConfig(props.baseUrl)
    .then((cfg) => {
      membershipEnabled.value = Boolean(cfg.membershipEnabled)
      emailResetEnabled.value = Boolean(cfg.emailResetEnabled)
      emailVerificationRequired.value = Boolean(cfg.emailVerificationRequired ?? cfg.emailResetEnabled)
      if (cfg.monthlyCredits) {
        monthlyCreditsConfig.value = cfg.monthlyCredits
      }
    })
    .catch(() => {
      // ignore transient refresh errors
    })
  if (currentUser.value) {
    void refreshCreditsAndPlatformModels(true)
  }
  showModal.value = true
}

function togglePanel() {
  if (!showModal.value) {
    openPanel()
    return
  }
  showModal.value = false
}

function toggleSecurity() {
  showSecurity.value = !showSecurity.value
  if (showSecurity.value) {
    securityForm.email = currentUser.value?.email || ''
    securityForm.emailVerifyCode = ''
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
    dispatchAuthChanged(currentUser.value)
    form.password = ''
    securityForm.email = currentUser.value?.email || ''
    await Promise.all([refreshSyncMeta(), refreshCreditsAndPlatformModels(true)])
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
    dispatchAuthChanged(currentUser.value)
    form.email = ''
    form.password = ''
    form.confirmPassword = ''
    securityForm.email = currentUser.value?.email || ''
    lastSyncVersion.value = 0
    lastSyncUpdatedAt.value = null
    await refreshCreditsAndPlatformModels(true)
  } catch (err) {
    notice.value = { type: 'error', text: errorMessage(err) }
  } finally {
    busy.value = false
    activeAction.value = null
  }
}

async function handleRequestEmailVerifyCode() {
  if (busy.value || emailCodeCooldownSec.value > 0 || !currentUser.value) return
  const email = securityForm.email.trim()
  if (!email) {
    notice.value = { type: 'error', text: text.value.errEmailVerifyRequired }
    return
  }
  busy.value = true
  activeAction.value = 'email-verify-send'
  notice.value = null
  try {
    const res = await requestEmailVerifyCode(email, props.baseUrl)
    notice.value = { type: 'success', text: res.message || text.value.okEmailVerifySent }
    startEmailCodeCooldown(60)
  } catch (err) {
    notice.value = { type: 'error', text: errorMessage(err) }
  } finally {
    busy.value = false
    activeAction.value = null
  }
}

async function handleSaveEmail() {
  if (busy.value || !currentUser.value) return
  const emailVal = securityForm.email.trim()
  const verificationCode = needsEmailVerification.value ? securityForm.emailVerifyCode.trim() : undefined
  if (needsEmailVerification.value && !/^\d{6}$/.test(verificationCode || '')) {
    notice.value = { type: 'error', text: text.value.errEmailVerifyCodeRequired }
    return
  }
  busy.value = true
  activeAction.value = 'profile'
  notice.value = null
  try {
    currentUser.value = await updateProfile(emailVal || null, props.baseUrl, undefined, verificationCode)
    securityForm.email = currentUser.value.email || ''
    securityForm.emailVerifyCode = ''
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
    dispatchAuthChanged(null)
    showSecurity.value = false
    showCreditLedger.value = false
    securityForm.email = ''
    securityForm.emailVerifyCode = ''
    securityForm.currentPassword = ''
    securityForm.newPassword = ''
    securityForm.confirmNewPassword = ''
    lastSyncVersion.value = 0
    lastSyncUpdatedAt.value = null
    await platformCatalog.clearUserPlatformState(services?.value?.modelManager)
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

.forgot-link-row {
  display: flex;
  justify-content: flex-end;
}

.inline-text-btn {
  background: none;
  border: none;
  padding: 0;
  font-size: 11px;
  font-weight: 500;
  color: var(--gp-accent, #0f766e);
  cursor: pointer;
}

.inline-text-btn:hover {
  text-decoration: underline;
}

.reset-code-bar {
  display: flex;
  gap: 6px;
  align-items: center;
}

.credits-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border-radius: 8px;
  background: var(--gp-surface-muted, rgba(128, 128, 128, 0.08));
  border: 1px solid var(--gp-border, rgba(24, 24, 27, 0.08));
  font-size: 12px;
}

.credits-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.credits-card-title {
  font-size: 12px;
  font-weight: 600;
}

.credits-balance-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
}

.credits-balance-label {
  font-size: 11px;
  color: var(--gp-muted, #52525b);
}

.credits-balance-value {
  font-size: 16px;
  font-weight: 700;
  color: var(--gp-accent, #0f766e);
  font-variant-numeric: tabular-nums;
}

.credits-quota-row {
  font-size: 11px;
  color: var(--gp-muted, #52525b);
}

.credits-hint {
  font-size: 11px;
  line-height: 1.45;
  color: var(--gp-muted, #52525b);
}

.credits-ledger-section {
  padding-top: 4px;
  border-top: 1px solid var(--gp-border, rgba(24, 24, 27, 0.08));
}

.credits-ledger-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.credits-ledger-chevron {
  transition: transform 160ms ease;
}

.credits-ledger-chevron--open {
  transform: rotate(180deg);
}

.credits-ledger-list {
  margin-top: 6px;
  max-height: 160px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.credits-ledger-empty {
  font-size: 11px;
  color: var(--gp-muted, #52525b);
  padding: 4px 0;
}

.credits-ledger-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-bottom: 5px;
  border-bottom: 1px dashed var(--gp-border, rgba(24, 24, 27, 0.08));
  font-size: 11px;
}

.credits-ledger-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.credits-ledger-item-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.credits-ledger-reason {
  font-weight: 500;
}

.credits-ledger-delta {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.credits-ledger-delta--plus {
  color: var(--gp-accent, #0f766e);
}

.credits-ledger-delta--minus {
  color: var(--gp-copper, #d96b43);
}

.credits-ledger-item-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 10px;
  color: var(--gp-muted, #52525b);
}

.credits-ledger-note {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
