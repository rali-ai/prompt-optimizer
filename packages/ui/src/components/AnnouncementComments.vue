<template>
  <div
    class="gp-ann-comments"
    :class="{ 'gp-ann-comments--compact': compact }"
    :data-announcement-id="announcementId"
    data-testid="announcement-comments"
  >
    <div class="gp-ann-comments__head">
      <button
        v-if="collapsible"
        type="button"
        class="gp-ann-comments__toggle"
        :aria-expanded="expanded"
        data-testid="announcement-comments-toggle"
        @click="emit('toggle')"
      >
        <NIcon :size="13"><MessageSquare :stroke-width="2" /></NIcon>
        <span>{{ headerTitle }}</span>
        <NIcon :size="12" class="gp-ann-comments__chevron">
          <ChevronUp v-if="expanded" :stroke-width="2" />
          <ChevronDown v-else :stroke-width="2" />
        </NIcon>
      </button>
      <div v-else class="gp-ann-comments__title">
        <NIcon :size="13"><MessageSquare :stroke-width="2" /></NIcon>
        <span>{{ headerTitle }}</span>
      </div>

      <button
        v-if="!collapsible || expanded"
        type="button"
        class="gp-ann-comments__refresh"
        :disabled="loading"
        :title="isEn ? 'Refresh comments' : '刷新评论'"
        :aria-label="isEn ? 'Refresh comments' : '刷新评论'"
        data-testid="announcement-comments-refresh"
        @click="emit('refresh')"
      >
        <NIcon :size="12" :class="{ 'gp-ann-comments__spin': loading }">
          <RefreshCw :stroke-width="2" />
        </NIcon>
        <span>{{ isEn ? 'Refresh' : '刷新' }}</span>
      </button>
    </div>

    <div v-if="!collapsible || expanded" class="gp-ann-comments__body">
      <div v-if="loading && comments.length === 0" class="gp-ann-comments__state">
        {{ isEn ? 'Loading comments...' : '正在加载评论...' }}
      </div>

      <div v-else-if="loadError && comments.length === 0" class="gp-ann-comments__state gp-ann-comments__state--error">
        <span>{{ loadError }}</span>
        <button type="button" class="gp-ann-comments__retry" @click="emit('refresh')">
          {{ isEn ? 'Retry' : '重试' }}
        </button>
      </div>

      <div v-else-if="comments.length === 0" class="gp-ann-comments__state" data-testid="announcement-comments-empty">
        {{ isEn ? 'No comments yet. Be the first to leave a message.' : '暂无评论，来发表第一条留言吧' }}
      </div>

      <ul v-else class="gp-ann-comments__list">
        <li
          v-for="comment in comments"
          :key="comment.id"
          class="gp-ann-comment-item"
          data-testid="announcement-comment-item"
        >
          <div class="gp-ann-comment-item__top">
            <div class="gp-ann-comment-item__who">
              <span class="gp-ann-comment-item__author">{{ comment.username }}</span>
              <span
                class="gp-ann-comment-badge"
                :class="badgeClass(comment)"
                data-testid="announcement-comment-badge"
              >
                {{ badgeLabel(comment) }}
              </span>
            </div>
            <div class="gp-ann-comment-item__right">
              <span v-if="formatCommentTime(comment.createdAt)" class="gp-ann-comment-item__time">
                {{ formatCommentTime(comment.createdAt) }}
              </span>
              <button
                v-if="canDelete(comment)"
                type="button"
                class="gp-ann-comment-item__del"
                :disabled="deletingId === comment.id"
                data-testid="announcement-comment-delete"
                @click="handleDelete(comment.id)"
              >
                {{ deletingId === comment.id ? (isEn ? '...' : '删除中') : (isEn ? 'Delete' : '删除') }}
              </button>
            </div>
          </div>
          <p class="gp-ann-comment-item__content">{{ comment.content }}</p>
        </li>
      </ul>

      <div v-if="actionError" class="gp-ann-comments__error" data-testid="announcement-comment-error">
        {{ actionError }}
      </div>

      <div v-if="currentAuthUser" class="gp-ann-composer" data-testid="announcement-comment-composer">
        <textarea
          v-model="draft"
          class="gp-ann-composer__input"
          :maxlength="MAX_COMMENT_LENGTH"
          rows="2"
          :disabled="submitting"
          :placeholder="isEn ? 'Write your message or feedback (max 500 chars)...' : '写下你的留言或建议（最多 500 字）...'"
          data-testid="announcement-comment-input"
          @keydown="handleKeydown"
        />
        <div class="gp-ann-composer__foot">
          <span class="gp-ann-composer__counter">
            {{ draft.length }} / {{ MAX_COMMENT_LENGTH }}
            <span class="gp-ann-composer__hint">
              {{ isEn ? '· Ctrl+Enter to send' : '· Ctrl+Enter 发送' }}
            </span>
          </span>
          <button
            type="button"
            class="gp-ann-composer__submit"
            :disabled="submitting || !draft.trim()"
            data-testid="announcement-comment-submit"
            @click="handleSubmit"
          >
            {{ submitting ? (isEn ? 'Posting...' : '发送中...') : (isEn ? 'Post comment' : '发表评论') }}
          </button>
        </div>
      </div>

      <div v-else class="gp-ann-guest" data-testid="announcement-comment-guest">
        <span class="gp-ann-guest__text">
          {{ isEn ? 'Sign up and sign in as a member to post comments.' : '注册并登录会员账号后即可在评论区留言' }}
        </span>
        <button
          type="button"
          class="gp-ann-guest__btn"
          data-testid="announcement-comment-login-btn"
          @click="emit('open-auth')"
        >
          {{ isEn ? 'Sign in / Register' : '去登录 / 注册' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { NIcon } from 'naive-ui'
import { ChevronDown, ChevronUp, MessageSquare, RefreshCw } from '@lucide/vue'
import { formatTierLabel } from '../composables/model/usePlatformModelCatalog'
import type { AnnouncementComment, SyncUser } from '../utils/user-sync-client'

const MAX_COMMENT_LENGTH = 500

const props = withDefaults(
  defineProps<{
    announcementId: string
    commentCount: number
    comments: AnnouncementComment[]
    loading?: boolean
    loadError?: string | null
    currentAuthUser: SyncUser | null
    isEn?: boolean
    collapsible?: boolean
    expanded?: boolean
    compact?: boolean
    onSubmitComment: (announcementId: string, content: string) => Promise<void>
    onDeleteComment: (announcementId: string, commentId: string) => Promise<void>
  }>(),
  {
    loading: false,
    loadError: null,
    isEn: false,
    collapsible: false,
    expanded: true,
    compact: false,
  },
)

const emit = defineEmits<{
  toggle: []
  refresh: []
  'open-auth': []
}>()

const draft = ref('')
const submitting = ref(false)
const deletingId = ref<string | null>(null)
const actionError = ref<string | null>(null)

const headerTitle = computed(() => {
  const count = Math.max(0, props.commentCount)
  return props.isEn ? `Comments (${count})` : `评论区 (${count})`
})

function badgeLabel(comment: AnnouncementComment): string {
  if (comment.role === 'admin') {
    return props.isEn ? 'Admin' : '管理员'
  }
  return formatTierLabel(comment.effectiveTier || comment.tier, !props.isEn)
}

function badgeClass(comment: AnnouncementComment): string {
  if (comment.role === 'admin') return 'gp-ann-comment-badge--admin'
  return `gp-ann-comment-badge--${comment.effectiveTier || comment.tier || 'free'}`
}

function formatCommentTime(ts: number): string {
  if (!ts || !Number.isFinite(ts) || ts <= 0) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${min}`
}

function canDelete(comment: AnnouncementComment): boolean {
  const user = props.currentAuthUser
  if (!user) return false
  return user.role === 'admin' || user.id === comment.userId
}

async function handleSubmit(): Promise<void> {
  if (submitting.value) return
  const content = draft.value.trim()
  if (!content) return
  if (content.length > MAX_COMMENT_LENGTH) {
    actionError.value = props.isEn
      ? `Comment cannot exceed ${MAX_COMMENT_LENGTH} characters`
      : `评论内容不能超过 ${MAX_COMMENT_LENGTH} 字`
    return
  }
  submitting.value = true
  actionError.value = null
  try {
    await props.onSubmitComment(props.announcementId, content)
    draft.value = ''
  } catch (err) {
    actionError.value = err instanceof Error && err.message
      ? err.message
      : (props.isEn ? 'Failed to post comment' : '发表评论失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}

async function handleDelete(commentId: string): Promise<void> {
  if (deletingId.value) return
  deletingId.value = commentId
  actionError.value = null
  try {
    await props.onDeleteComment(props.announcementId, commentId)
  } catch (err) {
    actionError.value = err instanceof Error && err.message
      ? err.message
      : (props.isEn ? 'Failed to delete comment' : '删除评论失败，请稍后重试')
  } finally {
    deletingId.value = null
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    void handleSubmit()
  }
}
</script>

<style>
.gp-ann-comments {
  margin-top: 10px;
  padding-top: 9px;
  border-top: 1px dashed var(--gp-border, rgba(24, 24, 27, 0.12));
}

.gp-ann-comments--compact {
  margin-top: 8px;
  padding-top: 8px;
}

.gp-ann-comments__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.gp-ann-comments__title,
.gp-ann-comments__toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  color: var(--gp-ink, #18181B);
}

.gp-ann-comments__toggle {
  padding: 2px 6px;
  margin: -2px -6px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  transition: background-color 140ms ease, color 140ms ease;
}

.gp-ann-comments__toggle:hover {
  background: rgba(15, 118, 110, 0.08);
  color: var(--gp-accent, #0F766E);
}

.gp-ann-comments__chevron {
  color: var(--gp-muted, #52525B);
}

.gp-ann-comments__refresh {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border: 1px solid var(--gp-border, rgba(24, 24, 27, 0.10));
  border-radius: 999px;
  background: var(--gp-surface, #FFFFFF);
  color: var(--gp-muted, #52525B);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: color 140ms ease, border-color 140ms ease;
}

.gp-ann-comments__refresh:hover:not(:disabled) {
  color: var(--gp-accent, #0F766E);
  border-color: var(--gp-border-strong, rgba(15, 118, 110, 0.34));
}

.gp-ann-comments__refresh:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.gp-ann-comments__spin {
  animation: gp-ann-spin 0.9s linear infinite;
}

@keyframes gp-ann-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.gp-ann-comments__body {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.gp-ann-comments__state {
  font-size: 12px;
  color: var(--gp-muted, #52525B);
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(24, 24, 27, 0.03);
}

html.dark .gp-ann-comments__state,
:root[data-workspace-theme="dark"] .gp-ann-comments__state {
  background: rgba(255, 255, 255, 0.04);
}

.gp-ann-comments__state--error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #B45309;
}

.gp-ann-comments__retry {
  padding: 2px 8px;
  border: 1px solid currentColor;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font-size: 11px;
  cursor: pointer;
}

.gp-ann-comments__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
}

.gp-ann-comment-item {
  padding: 7px 9px;
  border-radius: 8px;
  border: 1px solid var(--gp-border, rgba(24, 24, 27, 0.08));
  background: var(--gp-surface, #FFFFFF);
}

.gp-ann-comment-item__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.gp-ann-comment-item__who {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex-wrap: wrap;
}

.gp-ann-comment-item__author {
  font-size: 12px;
  font-weight: 600;
  color: var(--gp-ink, #18181B);
  word-break: break-all;
}

.gp-ann-comment-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.4;
  background: rgba(24, 24, 27, 0.07);
  color: var(--gp-muted, #52525B);
}

.gp-ann-comment-badge--admin {
  background: rgba(217, 107, 67, 0.16);
  color: #C2532B;
}

.gp-ann-comment-badge--standard {
  background: rgba(15, 118, 110, 0.12);
  color: #0F766E;
}

.gp-ann-comment-badge--pro {
  background: rgba(15, 118, 110, 0.18);
  color: #0D655E;
}

.gp-ann-comment-badge--internal {
  background: rgba(180, 83, 9, 0.16);
  color: #B45309;
}

html.dark .gp-ann-comment-badge,
:root[data-workspace-theme="dark"] .gp-ann-comment-badge {
  background: rgba(255, 255, 255, 0.09);
  color: #D4D4D8;
}

html.dark .gp-ann-comment-badge--admin,
:root[data-workspace-theme="dark"] .gp-ann-comment-badge--admin {
  background: rgba(245, 158, 11, 0.22);
  color: #FBBF24;
}

html.dark .gp-ann-comment-badge--standard,
html.dark .gp-ann-comment-badge--pro,
:root[data-workspace-theme="dark"] .gp-ann-comment-badge--standard,
:root[data-workspace-theme="dark"] .gp-ann-comment-badge--pro {
  background: rgba(20, 184, 166, 0.20);
  color: #5EEAD4;
}

.gp-ann-comment-item__right {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.gp-ann-comment-item__time {
  font-size: 11px;
  color: var(--gp-muted, #52525B);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.gp-ann-comment-item__del {
  padding: 1px 5px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--gp-muted, #52525B);
  font-size: 11px;
  cursor: pointer;
  transition: color 140ms ease, background-color 140ms ease;
}

.gp-ann-comment-item__del:hover:not(:disabled) {
  color: #DC2626;
  background: rgba(220, 38, 38, 0.09);
}

.gp-ann-comment-item__content {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--gp-ink, #18181B);
  white-space: pre-wrap;
  word-break: break-word;
}

.gp-ann-comments__error {
  font-size: 11.5px;
  color: #DC2626;
}

.gp-ann-composer {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.gp-ann-composer__input {
  width: 100%;
  box-sizing: border-box;
  padding: 7px 9px;
  border-radius: 8px;
  border: 1px solid var(--gp-border-strong, rgba(15, 118, 110, 0.24));
  background: var(--gp-surface, #FFFFFF);
  color: var(--gp-ink, #18181B);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.5;
  resize: vertical;
  min-height: 52px;
  transition: border-color 140ms ease, box-shadow 140ms ease;
}

.gp-ann-composer__input:focus {
  outline: none;
  border-color: var(--gp-accent, #0F766E);
  box-shadow: 0 0 0 2px rgba(15, 118, 110, 0.14);
}

.gp-ann-composer__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.gp-ann-composer__counter {
  font-size: 11px;
  color: var(--gp-muted, #52525B);
  font-variant-numeric: tabular-nums;
}

.gp-ann-composer__hint {
  opacity: 0.8;
}

.gp-ann-composer__submit {
  padding: 4px 12px;
  border: none;
  border-radius: 999px;
  background: var(--gp-accent, #0F766E);
  color: #FAF9F5;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 140ms ease, transform 140ms ease;
}

.gp-ann-composer__submit:hover:not(:disabled) {
  opacity: 0.92;
}

.gp-ann-composer__submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.gp-ann-guest {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  padding: 7px 10px;
  border-radius: 8px;
  border: 1px solid var(--gp-border, rgba(24, 24, 27, 0.10));
  background: var(--gp-surface, #FFFFFF);
}

.gp-ann-guest__text {
  font-size: 11.5px;
  color: var(--gp-muted, #52525B);
}

.gp-ann-guest__btn {
  padding: 4px 11px;
  border-radius: 999px;
  border: 1px solid var(--gp-accent, #0F766E);
  background: var(--gp-accent-soft, rgba(15, 118, 110, 0.10));
  color: var(--gp-accent, #0F766E);
  font-size: 11.5px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 140ms ease, color 140ms ease;
}

.gp-ann-guest__btn:hover {
  background: var(--gp-accent, #0F766E);
  color: #FAF9F5;
}

@media (max-width: 640px) {
  .gp-ann-composer__hint {
    display: none;
  }
}
</style>
