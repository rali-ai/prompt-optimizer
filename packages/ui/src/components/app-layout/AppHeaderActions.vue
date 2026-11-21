<template>
    <!--
        App 头部操作按钮组件

        职责:
        - 核心功能按钮: 模板管理、历史记录、模型管理、收藏夹、数据管理
        - 辅助功能: 主题切换、修改密码、源代码链接、语言切换、更新检查

        设计说明:
        - 从 App.vue 的 #actions slot 提取出来
        - 所有操作通过 emits 通知父组件处理
        - 收藏夹是页面型目的地，其余管理入口保持弹窗型交互
    -->
    <!-- 页面型管理入口：会接管主内容区 -->
    <div class="page-destination-group" data-testid="header-page-destinations">
        <ActionButtonUI
            icon="⭐"
            :text="$t('nav.favorites')"
            @click="emit('open-favorites')"
            :type="favoritesActive ? 'primary' : 'default'"
            data-testid="header-favorites-page-action"
            size="medium"
            :ghost="false"
            :round="true"
            :title="$t('favorites.page.title')"
            :aria-current="favoritesActive ? 'page' : undefined"
            :class="{ 'page-destination-active': favoritesActive }"
        />
    </div>

    <!-- 弹窗型管理/配置入口 -->
    <div class="modal-action-group" data-testid="header-modal-actions">
        <ActionButtonUI
            icon="📝"
            :text="$t('nav.templates')"
            @click="emit('open-templates')"
            type="default"
            size="medium"
            :ghost="false"
            :round="true"
        />
        <ActionButtonUI
            icon="📜"
            :text="$t('nav.history')"
            @click="emit('open-history')"
            type="default"
            size="medium"
            :ghost="false"
            :round="true"
        />
        <ActionButtonUI
            icon="⚙️"
            class="nav-config-action"
            :text="$t('nav.modelManager')"
            @click="emit('open-model-manager')"
            type="default"
            size="medium"
            :ghost="false"
            :round="true"
        />
        <NBadge :show="backupReminderDue" dot processing>
            <ActionButtonUI
                icon="💾"
                class="nav-config-action"
                :text="$t('nav.dataManager')"
                @click="emit('open-data-manager')"
                :type="backupReminderDue ? 'warning' : 'default'"
                size="medium"
                :ghost="false"
                :round="true"
                :title="backupReminderDue ? $t('dataManager.backupReminder.tooltip') : $t('nav.dataManager')"
            />
        </NBadge>
        <ActionButtonUI
            icon="🔣"
            class="nav-config-action"
            :text="$t('nav.variableManager')"
            @click="emit('open-variables')"
            type="default"
            size="medium"
            :ghost="false"
            :round="true"
        />
    </div>
    <!-- 辅助功能区 - 使用简化样式降低视觉权重 -->
    <ThemeToggleUI />
    <div class="aux-icon-group">
        <ChangePasswordButton />
        <NButton
            quaternary
            size="small"
            class="aux-text-button"
            data-testid="header-source-link"
            @click="emit('open-source')"
        >
            源代码
        </NButton>
        <LanguageSwitchDropdown />
        <!-- 自动更新组件 - 仅在Electron环境中显示 -->
        <UpdaterIcon />
    </div>
</template>

<script setup lang="ts">
/**
 * App 头部操作按钮组件
 *
 * @description
 * 从 App.vue 提取出的头部操作按钮组件，用于 MainLayoutUI 的 #actions slot。
 * 包含核心功能按钮和辅助功能按钮两部分。
 *
 * @features
 * - 核心功能: 模板管理、历史记录、模型管理、收藏夹、数据管理
 * - 辅助功能: 主题切换、修改密码、源代码链接、语言切换、更新检查
 * - 所有操作通过 emits 通知父组件
 *
 * @example
 * ```vue
 * <template #actions>
 *   <AppHeaderActions
 *     @open-templates="openTemplateManager"
 *     @open-history="historyManager.showHistory = true"
 *     @open-model-manager="modelManager.showConfig = true"
 *     @open-favorites="openFavoritesPage"
 *     @open-data-manager="showDataManager = true"
 *     @open-source="openSourceRepo"
 *   />
 * </template>
 * ```
 */
import ActionButtonUI from '../ActionButton.vue'
import ThemeToggleUI from '../ThemeToggleUI.vue'
import LanguageSwitchDropdown from '../LanguageSwitchDropdown.vue'
import UpdaterIcon from '../UpdaterIcon.vue'
import ChangePasswordButton from './ChangePasswordButton.vue'
import { NBadge, NButton } from 'naive-ui'

interface Props {
    favoritesActive?: boolean
    backupReminderDue?: boolean
}

withDefaults(defineProps<Props>(), {
    favoritesActive: false,
    backupReminderDue: false,
})

// ========================
// Emits 定义
// ========================
const emit = defineEmits<{
    /** 打开模板管理器 */
    'open-templates': []
    /** 打开历史记录 */
    'open-history': []
    /** 打开模型管理器 */
    'open-model-manager': []
    /** 打开收藏夹 */
    'open-favorites': []
    /** 打开数据管理器 */
    'open-data-manager': []
    /** 打开变量管理器 */
    'open-variables': []
    /** 打开源代码仓库（AGPL-3.0 源代码提供） */
    'open-source': []
}>()
</script>

<style scoped>
.aux-text-button {
    flex-shrink: 0;
    font-size: 12px;
}

.aux-icon-group {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-left: 6px;
}

.page-destination-group,
.modal-action-group {
    display: inline-flex;
    align-items: center;
    gap: 8px;
}

.page-destination-group {
    padding-right: 8px;
    border-right: 1px solid var(--n-border-color);
}

.page-destination-active {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--n-primary-color) 18%, transparent);
}
</style>
