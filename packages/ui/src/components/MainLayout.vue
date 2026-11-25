<template>
  <!-- 使用ToastUI包装整个布局以提供NMessageProvider -->
  <ToastUI>
    <NLayout
      ref="layoutRoot"
      class="compact-viewport-frame gp-studio-root"
      :style="{ height: isCompact ? '100dvh' : '100vh', maxHeight: isCompact ? '100dvh' : '100vh' }"
      style="position: fixed; inset: 0; width: 100vw; overflow: hidden; display: flex; min-height: 0;"
      content-style="height: 100%; max-height: 100%; min-height: 0; overflow: hidden;"
    >
      <!-- 移动端紧凑布局：顶部导航 + 全高内容区 -->
      <div
        v-if="isCompact"
        class="compact-viewport-frame gp-mobile-shell"
        :style="{ height: '100dvh', maxHeight: '100dvh' }"
      >
        <NLayoutHeader class="compact-header">
          <slot name="mobile-nav" />
        </NLayoutHeader>
        <AnnouncementBar mode="banner" />
        <NLayoutContent
          style="flex: 1; min-height: 0; overflow: hidden;"
          content-style="height: 100%; min-height: 0; padding: 0; display: flex; flex-direction: column; overflow: hidden;"
        >
          <div ref="contentRoot" class="main-content-wrapper">
            <slot name="main"></slot>
          </div>
        </NLayoutContent>
      </div>

      <!-- 桌面端全新双区工作台壳：左侧可折叠高词侧边栏 + 右侧极简模式顶栏与全幅画布 -->
      <div
        v-else
        class="gp-desktop-shell"
        :class="{ 'gp-desktop-shell--collapsed': sidebarCollapsed }"
        :lang="locale"
      >
        <aside class="gp-sidebar" :aria-label="t('common.appName')">
          <div class="gp-sidebar-brand">
            <a class="gp-brand-link" href="https://goprmpt.com" target="_blank" rel="noopener noreferrer" :title="t('common.appName')">
              <AppPreviewImage
                :src="logoSrc"
                :alt="t('common.appName')"
                :width="30"
                :height="30"
                object-fit="cover"
                class="logo-image gp-brand-logo"
                :show-toolbar="false"
                :preview-disabled="true"
                :fallback-src="fallbackLogoSrc"
              />
              <div v-show="!sidebarCollapsed" class="gp-brand-meta">
                <NText class="theme-title gp-brand-title" tag="h2">
                  <slot name="title">{{ t('common.appName') }}</slot>
                </NText>
                <span class="gp-brand-sub">GoPrmpt</span>
              </div>
            </a>
            <button
              type="button"
              class="gp-collapse-btn"
              :title="sidebarCollapsed ? (isEn ? 'Expand sidebar' : '展开侧边栏') : (isEn ? 'Collapse sidebar' : '收起侧边栏')"
              :aria-label="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
              @click="toggleSidebar"
            >
              <NIcon :size="16">
                <PanelLeftOpen v-if="sidebarCollapsed" :stroke-width="1.75" />
                <PanelLeftClose v-else :stroke-width="1.75" />
              </NIcon>
            </button>
          </div>

          <div class="gp-sidebar-nav nav-actions" :lang="locale">
            <slot name="actions"></slot>
          </div>
        </aside>

        <div class="gp-studio-column">
          <NLayoutHeader class="theme-header gp-topbar">
            <div class="gp-topbar-inner">
              <div class="gp-topbar-left core-navigation">
                <slot name="core-nav"></slot>
              </div>
              <div class="gp-topbar-right">
                <AnnouncementBar mode="bell" />
                <a class="gp-top-pill" href="https://goprmpt.com/library/" target="_blank" rel="noopener noreferrer">
                  <NIcon :size="14"><BookOpen :stroke-width="1.75" /></NIcon>
                  <span>{{ isEn ? '151 Prompts' : '151 条词库' }}</span>
                </a>
                <a class="gp-top-pill" href="https://goprmpt.com/learn/" target="_blank" rel="noopener noreferrer">
                  <NIcon :size="14"><GraduationCap :stroke-width="1.75" /></NIcon>
                  <span>{{ isEn ? '26 Lessons' : '26 节教程' }}</span>
                </a>
              </div>
            </div>
          </NLayoutHeader>

          <AnnouncementBar mode="banner" />

          <NLayoutContent
            has-sider
            class="gp-canvas-layout"
            style="flex: 1; min-height: 0; overflow: hidden;"
            content-style="height: 100%; max-height: 100%; min-height: 0; box-sizing: border-box; padding: 16px clamp(16px, 2vw, 28px) 20px; display: flex; flex-direction: column; align-items: stretch; overflow: hidden;"
          >
            <div ref="contentRoot" class="main-content-wrapper">
              <slot name="main"></slot>
            </div>
          </NLayoutContent>
        </div>
      </div>

      <!-- 弹窗插槽 -->
      <slot name="modals"></slot>
    </NLayout>
  </ToastUI>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { NLayout, NLayoutHeader, NLayoutContent, NText, NIcon } from 'naive-ui'
import { PanelLeftClose, PanelLeftOpen, BookOpen, GraduationCap } from '@lucide/vue'
import ToastUI from './Toast.vue'
import AnnouncementBar from './AnnouncementBar.vue'
import logoImage from '../assets/logo.svg'
import AppPreviewImage from './media/AppPreviewImage.vue'
import { i18n } from '../plugins/i18n'
import { useWorkspaceLayout } from '../composables/ui/useWorkspaceLayout'

const { isCompact, containerWidth, contentHeight } = useWorkspaceLayout()
const layoutRoot = ref()
const contentRoot = ref<HTMLElement>()
useResizeObserver(contentRoot, (entries) => {
  const height = entries[0]?.contentRect.height
  if (height) contentHeight.value = height
})
useResizeObserver(layoutRoot, (entries) => {
  const width = entries[0]?.contentRect.width
  if (width) containerWidth.value = width
})

const { t } = useI18n()
const locale = computed(() => i18n.global.locale.value)
const isEn = computed(() => String(locale.value).startsWith('en'))

const SIDEBAR_KEY = 'goprmpt-sidebar-collapsed'
const sidebarCollapsed = ref(false)

onMounted(() => {
  try {
    sidebarCollapsed.value = window.localStorage.getItem(SIDEBAR_KEY) === '1'
  } catch {
    sidebarCollapsed.value = false
  }
})

const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value
  try {
    window.localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed.value ? '1' : '0')
  } catch {
    // ignore storage errors
  }
}

const logoSrc = logoImage

const createFallbackSvg = () => {
  const svg = `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#0F766E"/>
      <text x="16" y="21" text-anchor="middle" fill="#FAF9F5" font-family="system-ui" font-size="14" font-weight="bold">G</text>
    </svg>
  `)}`
  return svg
}

const fallbackLogoSrc = createFallbackSvg()
</script>

<style>
.gp-mobile-shell {
  display: flex;
  flex-direction: column;
  width: 100vw;
  min-height: 0;
}

.gp-desktop-shell {
  display: flex;
  flex-direction: row;
  width: 100vw;
  height: 100vh;
  min-height: 0;
  overflow: hidden;
  background: var(--gp-bg, #FAF9F5);
}

.gp-sidebar {
  width: 224px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  padding: 14px 12px 12px;
  gap: 14px;
  background: var(--gp-chrome, #F3F1EA);
  border-right: 1px solid var(--gp-border, rgba(24, 24, 27, 0.08));
  transition: width 180ms ease;
  overflow-y: auto;
  overflow-x: hidden;
}

.gp-desktop-shell--collapsed .gp-sidebar {
  width: 66px;
  padding-inline: 8px;
}

.gp-sidebar-brand {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 4px 10px;
  border-bottom: 1px solid var(--gp-border, rgba(24, 24, 27, 0.08));
}

.gp-desktop-shell--collapsed .gp-sidebar-brand {
  flex-direction: column;
  gap: 8px;
  padding-inline: 0;
}

.gp-brand-link {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: inherit;
  min-width: 0;
}

.gp-brand-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.gp-brand-title {
  margin: 0 !important;
  font-size: 16px !important;
  font-weight: 700 !important;
  line-height: 1.15 !important;
  letter-spacing: -0.02em;
  color: var(--gp-ink, #18181B) !important;
  white-space: nowrap;
}

.gp-brand-sub {
  font-size: 11px;
  font-weight: 500;
  color: var(--gp-muted, #52525B);
  letter-spacing: 0.02em;
}

.gp-collapse-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--gp-muted, #52525B);
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 140ms ease, color 140ms ease, border-color 140ms ease;
}

.gp-collapse-btn:hover {
  background: rgba(15, 118, 110, 0.09);
  color: var(--gp-accent, #0F766E);
  border-color: var(--gp-border-strong, rgba(15, 118, 110, 0.28));
}

.gp-sidebar-nav {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.gp-studio-column {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.gp-topbar {
  position: relative;
  z-index: 30;
  overflow: visible !important;
  min-height: 54px !important;
  padding: 8px clamp(16px, 2vw, 28px) !important;
  background: var(--gp-header-bg, rgba(250, 249, 245, 0.88)) !important;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--gp-border, rgba(24, 24, 27, 0.08)) !important;
  flex-shrink: 0;
}

.gp-topbar-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: 36px;
}

.gp-topbar-left {
  display: flex;
  align-items: center;
  min-width: 0;
  flex: 1;
}

.gp-topbar-right {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.gp-top-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 11px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  text-decoration: none;
  color: var(--gp-muted, #52525B);
  background: var(--gp-surface, #FFFFFF);
  border: 1px solid var(--gp-border, rgba(24, 24, 27, 0.08));
  transition: color 150ms ease, border-color 150ms ease, transform 150ms ease;
}

.gp-top-pill:hover {
  color: var(--gp-accent, #0F766E);
  border-color: var(--gp-border-strong, rgba(15, 118, 110, 0.36));
  transform: translateY(-1px);
}

@media (max-width: 1120px) {
  .gp-topbar-right {
    display: none;
  }
}

.main-content-wrapper {
  width: 100%;
  margin: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.main-content-wrapper > * {
  flex: 1;
  min-height: 0;
}

.logo-image {
  border-radius: 9px;
  transition: transform 0.2s ease-in-out;
  flex-shrink: 0;
}

.custom-select {
  -webkit-appearance: none !important;
  -moz-appearance: none !important;
  appearance: none !important;
  background-image: none !important;
}

.custom-select::-ms-expand {
  display: none;
}
</style>
