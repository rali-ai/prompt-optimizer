<template>
    <!--
        App 头部操作按钮组件

        职责:
        - 核心功能按钮: 收藏夹、模板管理、历史记录、模型管理、数据管理、变量管理
        - 辅助功能: 主题切换、账号同步预留槽、修改密码、语言切换、更新检查
    -->
    <!-- 页面型管理入口：会接管主内容区 -->
    <div class="page-destination-group" data-testid="header-page-destinations">
        <ActionButtonUI
            :text="$t('nav.favorites')"
            @click="emit('open-favorites')"
            :type="favoritesActive ? 'primary' : 'default'"
            data-testid="header-favorites-page-action"
            size="medium"
            :ghost="false"
            :round="false"
            :title="$t('favorites.page.title')"
            :aria-current="favoritesActive ? 'page' : undefined"
            :class="{ 'page-destination-active': favoritesActive }"
        >
            <template #icon>
                <NIcon :size="15" class="header-svg-icon"><Star :stroke-width="1.75" /></NIcon>
            </template>
        </ActionButtonUI>
    </div>

    <!-- 弹窗型管理/配置入口 -->
    <div class="modal-action-group" data-testid="header-modal-actions">
        <ActionButtonUI
            :text="$t('nav.templates')"
            @click="emit('open-templates')"
            type="default"
            size="medium"
            :ghost="false"
            :round="false"
        >
            <template #icon>
                <NIcon :size="15" class="header-svg-icon"><FileText :stroke-width="1.75" /></NIcon>
            </template>
        </ActionButtonUI>
        <ActionButtonUI
            :text="$t('nav.history')"
            @click="emit('open-history')"
            type="default"
            size="medium"
            :ghost="false"
            :round="false"
        >
            <template #icon>
                <NIcon :size="15" class="header-svg-icon"><History :stroke-width="1.75" /></NIcon>
            </template>
        </ActionButtonUI>
        <ActionButtonUI
            class="nav-config-action"
            :text="$t('nav.modelManager')"
            @click="emit('open-model-manager')"
            type="default"
            size="medium"
            :ghost="false"
            :round="false"
        >
            <template #icon>
                <NIcon :size="15" class="header-svg-icon"><SlidersHorizontal :stroke-width="1.75" /></NIcon>
            </template>
        </ActionButtonUI>
        <NBadge :show="backupReminderDue" dot processing>
            <ActionButtonUI
                class="nav-config-action"
                :text="$t('nav.dataManager')"
                @click="emit('open-data-manager')"
                :type="backupReminderDue ? 'warning' : 'default'"
                size="medium"
                :ghost="false"
                :round="false"
                :title="backupReminderDue ? $t('dataManager.backupReminder.tooltip') : $t('nav.dataManager')"
            >
                <template #icon>
                    <NIcon :size="15" class="header-svg-icon"><Database :stroke-width="1.75" /></NIcon>
                </template>
            </ActionButtonUI>
        </NBadge>
        <ActionButtonUI
            class="nav-config-action"
            :text="$t('nav.variableManager')"
            @click="emit('open-variables')"
            type="default"
            size="medium"
            :ghost="false"
            :round="false"
        >
            <template #icon>
                <NIcon :size="15" class="header-svg-icon"><Braces :stroke-width="1.75" /></NIcon>
            </template>
        </ActionButtonUI>
    </div>

    <!-- 辅助功能区 -->
    <ThemeToggleUI />
    <div class="aux-icon-group">
        <AccountSyncButton />
        <ChangePasswordButton />
        <LanguageSwitchDropdown />
        <UpdaterIcon />
    </div>
</template>

<script setup lang="ts">
import ActionButtonUI from '../ActionButton.vue'
import ThemeToggleUI from '../ThemeToggleUI.vue'
import LanguageSwitchDropdown from '../LanguageSwitchDropdown.vue'
import UpdaterIcon from '../UpdaterIcon.vue'
import AccountSyncButton from './AccountSyncButton.vue'
import ChangePasswordButton from './ChangePasswordButton.vue'
import { NBadge, NIcon } from 'naive-ui'
import { Star, FileText, History, SlidersHorizontal, Database, Braces } from '@lucide/vue'

interface Props {
    favoritesActive?: boolean
    backupReminderDue?: boolean
}

withDefaults(defineProps<Props>(), {
    favoritesActive: false,
    backupReminderDue: false,
})

const emit = defineEmits<{
    'open-templates': []
    'open-history': []
    'open-model-manager': []
    'open-favorites': []
    'open-data-manager': []
    'open-variables': []
}>()
</script>

<style scoped>
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
    gap: 6px;
}

.page-destination-group {
    padding-right: 8px;
    border-right: 1px solid var(--n-border-color);
}

.page-destination-active {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--n-primary-color) 20%, transparent);
}

.header-svg-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
}
</style>
