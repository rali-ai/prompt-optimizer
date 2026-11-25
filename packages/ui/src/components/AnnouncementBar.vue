<template>
  <!-- Mode: Top slim announcement banner -->
  <div
    v-if="mode === 'banner' && currentBanner"
    ref="rootEl"
    class="gp-ann-banner-wrap"
    :class="`gp-ann-banner-wrap--${currentBanner.type}`"
    role="region"
    :aria-label="isEn ? 'Announcements' : '系统公告'"
    data-testid="announcement-banner"
  >
    <div class="gp-ann-bar">
      <div class="gp-ann-bar__left">
        <span class="gp-ann-pill" :class="`gp-ann-pill--${currentBanner.type}`">
          {{ typeLabel(currentBanner.type) }}
        </span>

        <button
          type="button"
          class="gp-ann-body-trigger"
          :aria-expanded="bannerExpanded"
          :title="isEn ? 'Click to expand details & comments' : '点击展开详情与评论'"
          @click="toggleBannerExpand"
        >
          <strong class="gp-ann-bar__title">{{ currentBanner.title }}</strong>
          <span v-if="currentBanner.content" class="gp-ann-bar__excerpt">
            {{ currentBanner.content }}
          </span>
          <NIcon :size="13" class="gp-ann-bar__chevron">
            <ChevronUp v-if="bannerExpanded" :stroke-width="2" />
            <ChevronDown v-else :stroke-width="2" />
          </NIcon>
        </button>
      </div>

      <div class="gp-ann-bar__right">
        <a
          v-if="bannerSafeUrl"
          class="gp-ann-action-link"
          :href="bannerSafeUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span>{{ currentBanner.linkText || (isEn ? 'Details' : '查看详情') }}</span>
          <NIcon :size="12"><ExternalLink :stroke-width="2" /></NIcon>
        </a>

        <button
          type="button"
          class="gp-ann-comment-btn"
          :class="{ 'gp-ann-comment-btn--active': bannerExpanded }"
          :aria-expanded="bannerExpanded"
          data-testid="announcement-banner-comments-btn"
          @click="toggleBannerComments"
        >
          <NIcon :size="12"><MessageSquare :stroke-width="2" /></NIcon>
          <span>{{ formatCommentBtnLabel(currentBanner.commentCount) }}</span>
        </button>

        <button
          v-if="announcements.length > 1"
          type="button"
          class="gp-ann-all-btn"
          :aria-expanded="isDropdownOpen"
          aria-haspopup="dialog"
          @click="toggleDropdown"
        >
          {{ isEn ? `All (${announcements.length})` : `全部 (${announcements.length})` }}
        </button>

        <button
          type="button"
          class="gp-ann-dismiss-btn"
          :aria-label="isEn ? 'Dismiss announcement' : '关闭此公告'"
          :title="isEn ? 'Dismiss' : '不再提示'"
          data-testid="announcement-dismiss"
          @click="dismissItem(currentBanner)"
        >
          <NIcon :size="14"><X :stroke-width="2" /></NIcon>
        </button>
      </div>
    </div>

    <!-- Inline expanded full content and comments for the active banner -->
    <div v-if="bannerExpanded" class="gp-ann-expanded" data-testid="announcement-banner-expanded">
      <p v-if="currentBanner.content" class="gp-ann-expanded__text">{{ currentBanner.content }}</p>
      <div v-if="formatDate(currentBanner) || bannerSafeUrl" class="gp-ann-expanded__meta">
        <span v-if="formatDate(currentBanner)" class="gp-ann-date">{{ formatDate(currentBanner) }}</span>
        <a
          v-if="bannerSafeUrl"
          class="gp-ann-card__link"
          :href="bannerSafeUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span>{{ currentBanner.linkText || (isEn ? 'Learn more' : '查看详情') }}</span>
          <NIcon :size="12"><ExternalLink :stroke-width="2" /></NIcon>
        </a>
      </div>
      <AnnouncementComments
        :announcement-id="currentBanner.id"
        :comment-count="currentBanner.commentCount"
        :comments="commentsFor(currentBanner.id)"
        :loading="isCommentsLoading(currentBanner.id)"
        :load-error="commentsErrorFor(currentBanner.id)"
        :current-auth-user="currentAuthUser"
        :is-en="isEn"
        :collapsible="false"
        :expanded="true"
        :on-submit-comment="handleSubmitComment"
        :on-delete-comment="handleDeleteComment"
        @refresh="refreshCommentsFor(currentBanner.id)"
        @open-auth="handleOpenAccountPanel"
      />
    </div>

    <!-- Anchored list popover opened via "全部 (N)" in banner -->
    <div
      v-if="isDropdownOpen"
      class="gp-ann-popover gp-ann-popover--banner"
      role="dialog"
      :aria-label="isEn ? 'All announcements' : '全部公告与活动'"
    >
      <div class="gp-ann-popover__head">
        <span class="gp-ann-popover__title">
          {{ isEn ? `Announcements (${announcements.length})` : `公告与活动 (${announcements.length})` }}
        </span>
        <button
          v-if="unreadCount > 0"
          type="button"
          class="gp-ann-text-btn"
          @click="markAllRead"
        >
          {{ isEn ? 'Mark all read' : '全部已读' }}
        </button>
      </div>

      <ul class="gp-ann-list">
        <li
          v-for="item in announcements"
          :key="`${item.id}:${item.updatedAt}`"
          class="gp-ann-card"
          :class="{ 'gp-ann-card--unread': !isDismissed(item) }"
        >
          <div class="gp-ann-card__top">
            <div class="gp-ann-card__badges">
              <span class="gp-ann-pill" :class="`gp-ann-pill--${item.type}`">
                {{ typeLabel(item.type) }}
              </span>
              <span v-if="item.isPinned" class="gp-ann-pinned-tag">
                {{ isEn ? 'Pinned' : '置顶' }}
              </span>
              <span v-if="!isDismissed(item)" class="gp-ann-unread-dot" aria-hidden="true" />
            </div>
            <span v-if="formatDate(item)" class="gp-ann-date">{{ formatDate(item) }}</span>
          </div>
          <div class="gp-ann-card__title">{{ item.title }}</div>
          <p v-if="item.content" class="gp-ann-card__body">{{ item.content }}</p>
          <div v-if="safeItemUrl(item)" class="gp-ann-card__foot">
            <a
              class="gp-ann-card__link"
              :href="safeItemUrl(item)!"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>{{ item.linkText || (isEn ? 'Learn more' : '查看详情') }}</span>
              <NIcon :size="12"><ExternalLink :stroke-width="2" /></NIcon>
            </a>
          </div>
          <AnnouncementComments
            :announcement-id="item.id"
            :comment-count="item.commentCount"
            :comments="commentsFor(item.id)"
            :loading="isCommentsLoading(item.id)"
            :load-error="commentsErrorFor(item.id)"
            :current-auth-user="currentAuthUser"
            :is-en="isEn"
            :collapsible="true"
            :expanded="isCardCommentsOpen(item.id)"
            :compact="true"
            :on-submit-comment="handleSubmitComment"
            :on-delete-comment="handleDeleteComment"
            @toggle="toggleCardComments(item.id)"
            @refresh="refreshCommentsFor(item.id)"
            @open-auth="handleOpenAccountPanel"
          />
        </li>
      </ul>
    </div>
  </div>

  <!-- Mode: Topbar notification bell pill -->
  <div
    v-else-if="mode === 'bell' && hasAnnouncements"
    ref="rootEl"
    class="gp-ann-bell-wrap"
    data-testid="announcement-bell"
  >
    <button
      type="button"
      class="gp-top-pill gp-ann-bell-btn"
      :class="{ 'gp-ann-bell-btn--active': isDropdownOpen }"
      :aria-expanded="isDropdownOpen"
      aria-haspopup="dialog"
      :aria-label="isEn ? 'Announcements' : '查看通知与活动'"
      @click="toggleDropdown"
    >
      <NIcon :size="14"><Bell :stroke-width="1.75" /></NIcon>
      <span>{{ isEn ? 'Notices' : '通知' }}</span>
      <span v-if="unreadCount > 0" class="gp-ann-unread-dot" aria-hidden="true" />
    </button>

    <div
      v-if="isDropdownOpen"
      class="gp-ann-popover gp-ann-popover--bell"
      role="dialog"
      :aria-label="isEn ? 'Announcements' : '公告与活动'"
    >
      <div class="gp-ann-popover__head">
        <span class="gp-ann-popover__title">
          {{ isEn ? `Announcements (${announcements.length})` : `公告与活动 (${announcements.length})` }}
        </span>
        <button
          v-if="unreadCount > 0"
          type="button"
          class="gp-ann-text-btn"
          @click="markAllRead"
        >
          {{ isEn ? 'Mark all read' : '全部已读' }}
        </button>
        <button
          v-else
          type="button"
          class="gp-ann-text-btn"
          @click="restoreAllBanners"
        >
          {{ isEn ? 'Show banner' : '重新显示横幅' }}
        </button>
      </div>

      <ul class="gp-ann-list">
        <li
          v-for="item in announcements"
          :key="`${item.id}:${item.updatedAt}`"
          class="gp-ann-card"
          :class="{ 'gp-ann-card--unread': !isDismissed(item) }"
        >
          <div class="gp-ann-card__top">
            <div class="gp-ann-card__badges">
              <span class="gp-ann-pill" :class="`gp-ann-pill--${item.type}`">
                {{ typeLabel(item.type) }}
              </span>
              <span v-if="item.isPinned" class="gp-ann-pinned-tag">
                {{ isEn ? 'Pinned' : '置顶' }}
              </span>
              <span v-if="!isDismissed(item)" class="gp-ann-unread-dot" aria-hidden="true" />
            </div>
            <span v-if="formatDate(item)" class="gp-ann-date">{{ formatDate(item) }}</span>
          </div>
          <div class="gp-ann-card__title">{{ item.title }}</div>
          <p v-if="item.content" class="gp-ann-card__body">{{ item.content }}</p>
          <div v-if="safeItemUrl(item)" class="gp-ann-card__foot">
            <a
              class="gp-ann-card__link"
              :href="safeItemUrl(item)!"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>{{ item.linkText || (isEn ? 'Learn more' : '查看详情') }}</span>
              <NIcon :size="12"><ExternalLink :stroke-width="2" /></NIcon>
            </a>
          </div>
          <AnnouncementComments
            :announcement-id="item.id"
            :comment-count="item.commentCount"
            :comments="commentsFor(item.id)"
            :loading="isCommentsLoading(item.id)"
            :load-error="commentsErrorFor(item.id)"
            :current-auth-user="currentAuthUser"
            :is-en="isEn"
            :collapsible="true"
            :expanded="isCardCommentsOpen(item.id)"
            :compact="true"
            :on-submit-comment="handleSubmitComment"
            :on-delete-comment="handleDeleteComment"
            @toggle="toggleCardComments(item.id)"
            @refresh="refreshCommentsFor(item.id)"
            @open-auth="handleOpenAccountPanel"
          />
        </li>
      </ul>
    </div>
  </div>
</template>

<script lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  announcementDismissKey,
  createAnnouncementComment,
  deleteAnnouncementComment,
  getActiveAnnouncements,
  getAnnouncementComments,
  getMe,
  resolveDefaultSyncBaseUrl,
  safeAnnouncementUrl,
  type ActiveAnnouncement,
  type AnnouncementComment,
  type AnnouncementType,
  type SyncUser,
} from '../utils/user-sync-client'

const DISMISSED_STORAGE_KEY = 'goprmpt_dismissed_announcements'
const MAX_STORED_DISMISSED_KEYS = 100

const sharedAnnouncements = ref<ActiveAnnouncement[]>([])
const sharedDismissed = ref<Set<string>>(new Set())
const activeDropdownSource = ref<'bell' | 'banner' | null>(null)
const sharedCommentsById = ref<Record<string, AnnouncementComment[]>>({})
const sharedCommentsLoaded = ref<Set<string>>(new Set())
const sharedCommentsLoading = ref<Record<string, boolean>>({})
const sharedCommentsError = ref<Record<string, string | null>>({})
const sharedAuthUser = ref<SyncUser | null>(null)
const sharedAuthResolved = ref(false)

let dismissedHydrated = false
let fetchInFlight: Promise<void> | null = null
let authFetchInFlight: Promise<void> | null = null

export function resetAnnouncementBarState(): void {
  sharedAnnouncements.value = []
  sharedDismissed.value = new Set()
  activeDropdownSource.value = null
  sharedCommentsById.value = {}
  sharedCommentsLoaded.value = new Set()
  sharedCommentsLoading.value = {}
  sharedCommentsError.value = {}
  sharedAuthUser.value = null
  sharedAuthResolved.value = false
  dismissedHydrated = false
  fetchInFlight = null
  authFetchInFlight = null
}

function hydrateDismissed(): void {
  if (dismissedHydrated) return
  dismissedHydrated = true
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage?.getItem(DISMISSED_STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      const valid = parsed.filter((item): item is string => typeof item === 'string' && item.length > 0)
      sharedDismissed.value = new Set(valid.slice(-MAX_STORED_DISMISSED_KEYS))
    }
  } catch {
    // Ignore storage read/parse errors
  }
}

function persistDismissed(next: Set<string>): void {
  const list = Array.from(next).slice(-MAX_STORED_DISMISSED_KEYS)
  sharedDismissed.value = new Set(list)
  if (typeof window === 'undefined') return
  try {
    window.localStorage?.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(list))
  } catch {
    // Ignore storage quota/privacy errors
  }
}

function sortActiveAnnouncements(items: ActiveAnnouncement[]): ActiveAnnouncement[] {
  const now = Date.now()
  return items
    .filter((item) => item.isActive && (item.expiresAt === null || item.expiresAt > now))
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      if (a.item.isPinned !== b.item.isPinned) return a.item.isPinned ? -1 : 1
      if (a.item.updatedAt !== b.item.updatedAt) return b.item.updatedAt - a.item.updatedAt
      return a.index - b.index
    })
    .map(({ item }) => item)
}

function ensureAnnouncementsLoaded(): Promise<void> {
  hydrateDismissed()
  if (fetchInFlight) return fetchInFlight
  if (typeof fetch !== 'function') {
    fetchInFlight = Promise.resolve()
    return fetchInFlight
  }

  fetchInFlight = (async () => {
    try {
      const items = await getActiveAnnouncements(resolveDefaultSyncBaseUrl())
      sharedAnnouncements.value = sortActiveAnnouncements(items)
    } catch {
      // Silent fail-open for offline/local environments without user-sync-api
      sharedAnnouncements.value = []
    }
  })()

  return fetchInFlight
}

function ensureAuthUserLoaded(): Promise<void> {
  if (sharedAuthResolved.value) return Promise.resolve()
  if (authFetchInFlight) return authFetchInFlight
  if (typeof fetch !== 'function') {
    sharedAuthResolved.value = true
    return Promise.resolve()
  }

  authFetchInFlight = (async () => {
    try {
      const user = await getMe(resolveDefaultSyncBaseUrl())
      sharedAuthUser.value = user
    } catch {
      sharedAuthUser.value = null
    } finally {
      sharedAuthResolved.value = true
      authFetchInFlight = null
    }
  })()

  return authFetchInFlight
}

function syncAnnouncementCommentCount(announcementId: string, commentCount: number): void {
  const nextCount = Math.max(0, Math.floor(commentCount))
  sharedAnnouncements.value = sharedAnnouncements.value.map((item) =>
    item.id === announcementId ? { ...item, commentCount: nextCount } : item,
  )
}

async function fetchCommentsForAnnouncement(announcementId: string, force = false): Promise<void> {
  if (!announcementId) return
  if (!force && sharedCommentsLoaded.value.has(announcementId)) return
  if (sharedCommentsLoading.value[announcementId]) return

  sharedCommentsLoading.value = { ...sharedCommentsLoading.value, [announcementId]: true }
  sharedCommentsError.value = { ...sharedCommentsError.value, [announcementId]: null }

  try {
    const res = await getAnnouncementComments(announcementId, resolveDefaultSyncBaseUrl())
    sharedCommentsById.value = { ...sharedCommentsById.value, [announcementId]: res.comments }
    const nextLoaded = new Set(sharedCommentsLoaded.value)
    nextLoaded.add(announcementId)
    sharedCommentsLoaded.value = nextLoaded
    syncAnnouncementCommentCount(announcementId, res.commentCount)
  } catch (err) {
    sharedCommentsError.value = {
      ...sharedCommentsError.value,
      [announcementId]: err instanceof Error && err.message ? err.message : '评论加载失败',
    }
  } finally {
    sharedCommentsLoading.value = { ...sharedCommentsLoading.value, [announcementId]: false }
  }
}
</script>

<script setup lang="ts">
import { NIcon } from 'naive-ui'
import { Bell, ChevronDown, ChevronUp, ExternalLink, MessageSquare, X } from '@lucide/vue'
import { i18n } from '../plugins/i18n'
import AnnouncementComments from './AnnouncementComments.vue'

const props = withDefaults(
  defineProps<{
    mode?: 'banner' | 'bell'
  }>(),
  {
    mode: 'banner',
  },
)

const rootEl = ref<HTMLElement | null>(null)
const bannerExpanded = ref(false)
const openCardCommentIds = ref<Set<string>>(new Set())

const locale = computed(() => i18n.global.locale.value)
const isEn = computed(() => String(locale.value || '').toLowerCase().startsWith('en'))

const announcements = computed(() => sharedAnnouncements.value)
const hasAnnouncements = computed(() => announcements.value.length > 0)
const currentAuthUser = computed(() => sharedAuthUser.value)

function isDismissed(item: ActiveAnnouncement): boolean {
  return sharedDismissed.value.has(announcementDismissKey(item))
}

const unreadItems = computed(() => announcements.value.filter((item) => !isDismissed(item)))
const unreadCount = computed(() => unreadItems.value.length)
const currentBanner = computed(() => unreadItems.value[0] ?? null)
const bannerSafeUrl = computed(() =>
  currentBanner.value ? safeAnnouncementUrl(currentBanner.value.linkUrl) : null,
)
const isDropdownOpen = computed(() => activeDropdownSource.value === props.mode)

watch(
  () => currentBanner.value?.id,
  () => {
    bannerExpanded.value = false
  },
)

function safeItemUrl(item: ActiveAnnouncement): string | null {
  return safeAnnouncementUrl(item.linkUrl)
}

function typeLabel(type: AnnouncementType): string {
  if (type === 'activity') return isEn.value ? 'Event' : '活动'
  if (type === 'maintenance') return isEn.value ? 'Maintenance' : '维护'
  return isEn.value ? 'Notice' : '通知'
}

function formatCommentBtnLabel(count: number): string {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
  if (isEn.value) {
    return n > 0 ? `Comments (${n})` : 'Comments'
  }
  return n > 0 ? `评论 (${n})` : '评论'
}

function formatDate(item: ActiveAnnouncement): string {
  const ts = item.updatedAt || item.createdAt
  if (!ts || !Number.isFinite(ts) || ts <= 0) return ''
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function commentsFor(announcementId: string): AnnouncementComment[] {
  return sharedCommentsById.value[announcementId] ?? []
}

function isCommentsLoading(announcementId: string): boolean {
  return Boolean(sharedCommentsLoading.value[announcementId])
}

function commentsErrorFor(announcementId: string): string | null {
  return sharedCommentsError.value[announcementId] ?? null
}

function openCommentsFor(announcementId: string): void {
  void ensureAuthUserLoaded()
  void fetchCommentsForAnnouncement(announcementId, false)
}

function refreshCommentsFor(announcementId: string): void {
  void ensureAuthUserLoaded()
  void fetchCommentsForAnnouncement(announcementId, true)
}

function isCardCommentsOpen(announcementId: string): boolean {
  return openCardCommentIds.value.has(announcementId)
}

function toggleCardComments(announcementId: string): void {
  const next = new Set(openCardCommentIds.value)
  if (next.has(announcementId)) {
    next.delete(announcementId)
  } else {
    next.add(announcementId)
    openCommentsFor(announcementId)
  }
  openCardCommentIds.value = next
}

function toggleBannerExpand(): void {
  if (!currentBanner.value) return
  bannerExpanded.value = !bannerExpanded.value
  if (bannerExpanded.value) {
    openCommentsFor(currentBanner.value.id)
  }
}

function toggleBannerComments(): void {
  if (!currentBanner.value) return
  if (bannerExpanded.value) {
    bannerExpanded.value = false
    return
  }
  bannerExpanded.value = true
  openCommentsFor(currentBanner.value.id)
}

function toggleDropdown(): void {
  activeDropdownSource.value = isDropdownOpen.value ? null : props.mode
}

async function handleSubmitComment(announcementId: string, content: string): Promise<void> {
  const res = await createAnnouncementComment(announcementId, content, resolveDefaultSyncBaseUrl())
  const existing = sharedCommentsById.value[announcementId] ?? []
  sharedCommentsById.value = {
    ...sharedCommentsById.value,
    [announcementId]: [res.comment, ...existing.filter((item) => item.id !== res.comment.id)],
  }
  const nextLoaded = new Set(sharedCommentsLoaded.value)
  nextLoaded.add(announcementId)
  sharedCommentsLoaded.value = nextLoaded
  syncAnnouncementCommentCount(announcementId, res.commentCount)
}

async function handleDeleteComment(announcementId: string, commentId: string): Promise<void> {
  const res = await deleteAnnouncementComment(announcementId, commentId, resolveDefaultSyncBaseUrl())
  const existing = sharedCommentsById.value[announcementId] ?? []
  sharedCommentsById.value = {
    ...sharedCommentsById.value,
    [announcementId]: existing.filter((item) => item.id !== commentId),
  }
  syncAnnouncementCommentCount(announcementId, res.commentCount)
}

function handleOpenAccountPanel(): void {
  activeDropdownSource.value = null
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('goprmpt:open-account-panel', { detail: { tab: 'register' } }))
  }
}

function handleAuthChanged(event: Event): void {
  const detail = (event as CustomEvent<{ user?: SyncUser | null }> | undefined)?.detail
  sharedAuthUser.value = detail?.user ?? null
  sharedAuthResolved.value = true
}

function dismissItem(item: ActiveAnnouncement): void {
  const next = new Set(sharedDismissed.value)
  next.add(announcementDismissKey(item))
  persistDismissed(next)
  bannerExpanded.value = false
  if (activeDropdownSource.value === 'banner') {
    activeDropdownSource.value = null
  }
}

function markAllRead(): void {
  const next = new Set(sharedDismissed.value)
  for (const item of announcements.value) {
    next.add(announcementDismissKey(item))
  }
  persistDismissed(next)
  bannerExpanded.value = false
  if (activeDropdownSource.value === 'banner') {
    activeDropdownSource.value = null
  }
}

function restoreAllBanners(): void {
  const next = new Set(sharedDismissed.value)
  for (const item of announcements.value) {
    next.delete(announcementDismissKey(item))
  }
  persistDismissed(next)
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!isDropdownOpen.value) return
  const target = event.target as Node | null
  if (rootEl.value && target && rootEl.value.contains(target)) return
  activeDropdownSource.value = null
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (isDropdownOpen.value) {
    activeDropdownSource.value = null
    return
  }
  if (props.mode === 'banner' && bannerExpanded.value) {
    bannerExpanded.value = false
  }
}

onMounted(() => {
  void ensureAnnouncementsLoaded()
  if (typeof window !== 'undefined') {
    window.addEventListener('goprmpt:auth-changed', handleAuthChanged)
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('pointerdown', handleDocumentPointerDown)
    document.addEventListener('keydown', handleDocumentKeydown)
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('goprmpt:auth-changed', handleAuthChanged)
  }
  if (typeof document !== 'undefined') {
    document.removeEventListener('pointerdown', handleDocumentPointerDown)
    document.removeEventListener('keydown', handleDocumentKeydown)
  }
})
</script>

<style>
.gp-ann-banner-wrap {
  position: relative;
  z-index: 25;
  flex-shrink: 0;
  border-bottom: 1px solid var(--gp-border, rgba(24, 24, 27, 0.085));
  background: rgba(15, 118, 110, 0.055);
  color: var(--gp-ink, #18181B);
  transition: background-color 160ms ease, border-color 160ms ease;
}

.gp-ann-banner-wrap--notice {
  background: rgba(15, 118, 110, 0.06);
  border-bottom-color: rgba(15, 118, 110, 0.16);
}

.gp-ann-banner-wrap--activity {
  background: rgba(217, 107, 67, 0.07);
  border-bottom-color: rgba(217, 107, 67, 0.20);
}

.gp-ann-banner-wrap--maintenance {
  background: rgba(180, 83, 9, 0.075);
  border-bottom-color: rgba(180, 83, 9, 0.22);
}

html.dark .gp-ann-banner-wrap--notice,
:root[data-workspace-theme="dark"] .gp-ann-banner-wrap--notice {
  background: rgba(20, 184, 166, 0.09);
  border-bottom-color: rgba(20, 184, 166, 0.22);
}

html.dark .gp-ann-banner-wrap--activity,
:root[data-workspace-theme="dark"] .gp-ann-banner-wrap--activity {
  background: rgba(245, 158, 11, 0.095);
  border-bottom-color: rgba(245, 158, 11, 0.24);
}

html.dark .gp-ann-banner-wrap--maintenance,
:root[data-workspace-theme="dark"] .gp-ann-banner-wrap--maintenance {
  background: rgba(245, 158, 11, 0.12);
  border-bottom-color: rgba(245, 158, 11, 0.28);
}

.gp-ann-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 36px;
  padding: 6px clamp(16px, 2vw, 28px);
}

.gp-mobile-shell .gp-ann-bar {
  padding: 6px 12px;
  gap: 8px;
}

.gp-ann-bar__left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.gp-ann-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: 0.01em;
}

.gp-ann-pill--notice {
  background: rgba(15, 118, 110, 0.12);
  color: #0F766E;
}

.gp-ann-pill--activity {
  background: rgba(217, 107, 67, 0.14);
  color: #C2532B;
}

.gp-ann-pill--maintenance {
  background: rgba(180, 83, 9, 0.14);
  color: #B45309;
}

html.dark .gp-ann-pill--notice,
:root[data-workspace-theme="dark"] .gp-ann-pill--notice {
  background: rgba(20, 184, 166, 0.18);
  color: #5EEAD4;
}

html.dark .gp-ann-pill--activity,
:root[data-workspace-theme="dark"] .gp-ann-pill--activity {
  background: rgba(245, 158, 11, 0.18);
  color: #FBBF24;
}

html.dark .gp-ann-pill--maintenance,
:root[data-workspace-theme="dark"] .gp-ann-pill--maintenance {
  background: rgba(245, 158, 11, 0.22);
  color: #FCD34D;
}

.gp-ann-body-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
  padding: 2px 4px;
  margin: -2px -4px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 140ms ease;
}

.gp-ann-body-trigger:hover {
  background: rgba(24, 24, 27, 0.045);
}

html.dark .gp-ann-body-trigger:hover,
:root[data-workspace-theme="dark"] .gp-ann-body-trigger:hover {
  background: rgba(255, 255, 255, 0.06);
}

.gp-ann-bar__title {
  flex-shrink: 0;
  max-width: 45%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--gp-ink, #18181B);
}

.gp-ann-bar__excerpt {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  color: var(--gp-muted, #52525B);
}

.gp-ann-bar__chevron {
  flex-shrink: 0;
  color: var(--gp-muted, #52525B);
}

.gp-ann-bar__right {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.gp-ann-action-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 600;
  text-decoration: none;
  color: var(--gp-accent, #0F766E);
  background: var(--gp-surface, #FFFFFF);
  border: 1px solid var(--gp-border-strong, rgba(15, 118, 110, 0.30));
  white-space: nowrap;
  transition: background-color 140ms ease, color 140ms ease, border-color 140ms ease;
}

.gp-ann-action-link:hover {
  background: var(--gp-accent, #0F766E);
  color: #FFFFFF;
  border-color: var(--gp-accent, #0F766E);
}

.gp-ann-comment-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid var(--gp-border, rgba(24, 24, 27, 0.12));
  background: var(--gp-surface, #FFFFFF);
  color: var(--gp-muted, #52525B);
  font-size: 11.5px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: color 140ms ease, border-color 140ms ease, background-color 140ms ease;
}

.gp-ann-comment-btn:hover,
.gp-ann-comment-btn--active {
  color: var(--gp-accent, #0F766E);
  border-color: var(--gp-border-strong, rgba(15, 118, 110, 0.36));
  background: var(--gp-accent-soft, rgba(15, 118, 110, 0.08));
}

.gp-ann-all-btn {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid var(--gp-border, rgba(24, 24, 27, 0.12));
  background: var(--gp-surface, #FFFFFF);
  color: var(--gp-muted, #52525B);
  font-size: 11.5px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: color 140ms ease, border-color 140ms ease;
}

.gp-ann-all-btn:hover {
  color: var(--gp-accent, #0F766E);
  border-color: var(--gp-border-strong, rgba(15, 118, 110, 0.36));
}

.gp-ann-dismiss-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--gp-muted, #52525B);
  cursor: pointer;
  transition: background-color 140ms ease, color 140ms ease;
}

.gp-ann-dismiss-btn:hover {
  background: rgba(24, 24, 27, 0.07);
  color: var(--gp-ink, #18181B);
}

html.dark .gp-ann-dismiss-btn:hover,
:root[data-workspace-theme="dark"] .gp-ann-dismiss-btn:hover {
  background: rgba(255, 255, 255, 0.10);
}

.gp-ann-expanded {
  padding: 8px clamp(16px, 2vw, 28px) 10px;
  border-top: 1px dashed var(--gp-border, rgba(24, 24, 27, 0.10));
  background: var(--gp-surface-muted, #F7F5EE);
}

.gp-mobile-shell .gp-ann-expanded {
  padding: 8px 12px 10px;
}

.gp-ann-expanded__text {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--gp-ink, #18181B);
  white-space: pre-wrap;
  word-break: break-word;
}

.gp-ann-expanded__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 8px;
}

/* Bell pill & Dropdown Popover */
.gp-ann-bell-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.gp-ann-bell-btn {
  position: relative;
  cursor: pointer;
  font-family: inherit;
}

.gp-ann-bell-btn--active {
  color: var(--gp-accent, #0F766E);
  border-color: var(--gp-border-strong, rgba(15, 118, 110, 0.36));
}

.gp-ann-unread-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--gp-copper, #D96B43);
  flex-shrink: 0;
}

.gp-ann-popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 60;
  width: min(420px, calc(100vw - 24px));
  max-height: min(560px, 78vh);
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  border: 1px solid var(--gp-border, rgba(24, 24, 27, 0.10));
  background: var(--gp-surface, #FFFFFF);
  box-shadow: 0 18px 42px -12px rgba(24, 24, 27, 0.18), 0 2px 6px rgba(24, 24, 27, 0.06);
  overflow: hidden;
}

.gp-ann-popover--banner {
  right: clamp(12px, 2vw, 24px);
}

html.dark .gp-ann-popover,
:root[data-workspace-theme="dark"] .gp-ann-popover {
  box-shadow: 0 20px 48px -10px rgba(0, 0, 0, 0.65);
}

.gp-ann-popover__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--gp-border, rgba(24, 24, 27, 0.08));
  background: var(--gp-chrome, #F3F1EA);
}

.gp-ann-popover__title {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--gp-ink, #18181B);
}

.gp-ann-text-btn {
  padding: 2px 6px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--gp-accent, #0F766E);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 140ms ease;
}

.gp-ann-text-btn:hover {
  background: var(--gp-accent-soft, rgba(15, 118, 110, 0.10));
}

.gp-ann-list {
  margin: 0;
  padding: 10px;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
}

.gp-ann-card {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--gp-border, rgba(24, 24, 27, 0.08));
  background: var(--gp-surface-muted, #F7F5EE);
}

.gp-ann-card--unread {
  border-color: var(--gp-border-strong, rgba(15, 118, 110, 0.28));
  background: var(--gp-surface, #FFFFFF);
}

.gp-ann-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.gp-ann-card__badges {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.gp-ann-pinned-tag {
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--gp-muted, #52525B);
  background: rgba(24, 24, 27, 0.06);
}

html.dark .gp-ann-pinned-tag,
:root[data-workspace-theme="dark"] .gp-ann-pinned-tag {
  background: rgba(255, 255, 255, 0.09);
}

.gp-ann-date {
  font-size: 11px;
  color: var(--gp-muted, #52525B);
  white-space: nowrap;
}

.gp-ann-card__title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.45;
  color: var(--gp-ink, #18181B);
  word-break: break-word;
}

.gp-ann-card__body {
  margin: 5px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--gp-muted, #52525B);
  white-space: pre-wrap;
  word-break: break-word;
}

.gp-ann-card__foot {
  margin-top: 8px;
}

.gp-ann-card__link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--gp-accent, #0F766E);
  text-decoration: none;
}

.gp-ann-card__link:hover {
  text-decoration: underline;
}

@media (max-width: 640px) {
  .gp-ann-bar__title {
    max-width: 100%;
  }

  .gp-ann-bar__excerpt {
    display: none;
  }
}
</style>
