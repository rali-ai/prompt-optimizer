<template>
  <div class="text-model-manager">
    <div
      v-if="platformModels.length > 0"
      class="platform-models-strip"
      data-testid="platform-models-info-strip"
    >
      <div class="platform-models-strip__main">
        <span class="platform-models-strip__badge">{{ isZh ? '网站平台模型' : 'Platform Models' }}</span>
        <span class="platform-models-strip__summary">{{ platformStripSummary }}</span>
      </div>
      <div class="platform-models-strip__note">
        {{ platformStripNote }}
      </div>
    </div>

    <LocalServiceDiscovery :active="active && modelsReady" :models="manager.models.value"
      :disabled="preparingLocalService || showEditModal" @select="handleLocalService" />
    <TextModelList
      :models="visibleModels"
      :is-testing-connection-for="isTestingConnectionFor"
      :is-default-model="manager.isDefaultModel"
      @test="handleTestConnection"
      @edit="handleEditModel"
      @clone="handleCloneModel"
      @enable="handleEnableModel"
      @disable="handleDisableModel"
      @delete="handleDeleteModel"
    />

    <TextModelEditModal
      :show="showEditModal"
      @update:show="updateEditModalVisibility"
      @saved="handleModelUpdated"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, provide, ref, h, watch, computed } from 'vue'

import { useI18n } from 'vue-i18n'
import { i18n } from '../plugins/i18n'
import { isRunningInElectron } from '@prompt-optimizer/core'
import LocalServiceDiscovery from './LocalServiceDiscovery.vue'
import { isChromeBuiltInPlaceholder, type DiscoveredLocalService } from '../utils/local-model-discovery'
import { useTextModelManager } from '../composables/model/useTextModelManager'
import { MODELS_SYNCED_EVENT, usePlatformModelCatalog } from '../composables/model/usePlatformModelCatalog'
import { filterDomesticTextModels, isPlatformModelId } from '../utils/domestic-models'
import TextModelList from './TextModelList.vue'
import TextModelEditModal from './TextModelEditModal.vue'
import { useDialog } from 'naive-ui'
import { useToast } from '../composables/ui/useToast'
import { useConfirmDialog } from '../composables/ui/useConfirmDialog'
import { getProviderDisplayName } from '../utils/provider-display'

const emit = defineEmits(['modelsUpdated'])
const props = withDefaults(defineProps<{ active?: boolean }>(), { active: false })
const { t } = useI18n()
const toast = useToast()
const dialog = useDialog()
const confirmDialog = useConfirmDialog()
const manager = useTextModelManager()
const catalog = usePlatformModelCatalog()
provide('textModelManager', manager)

const isZh = computed(() => String(i18n.global.locale.value || '').toLowerCase().startsWith('zh'))
const platformModels = catalog.platformModels
const accessiblePlatformCount = computed(
  () => platformModels.value.filter(model => model.accessible).length
)
const platformStripSummary = computed(() => {
  const total = platformModels.value.length
  const accessible = accessiblePlatformCount.value
  const credits = catalog.credits.value
  if (credits !== null || accessible > 0) {
    const balancePart = credits !== null
      ? (isZh.value ? ` · 可用积分 ${credits.balance}` : ` · ${credits.balance} credits`)
      : ''
    return isZh.value
      ? `当前可用 ${accessible} / ${total} 个平台积分模型${balancePart}`
      : `${accessible} / ${total} hosted models available${balancePart}`
  }
  return isZh.value
    ? `共 ${total} 个平台积分模型（登录会员账号即可直接调用）`
    : `${total} hosted platform models (sign in as a member to use credits)`
})
const platformStripNote = computed(() =>
  isZh.value
    ? '免费用户与会员均可随时在下方添加或配置自己的国产模型 API Key（仅保存在浏览器本地）。'
    : 'Both guests and members can also add their own domestic model API keys below (stored locally).'
)

const visibleModels = computed(() =>
  filterDomesticTextModels(
    manager.models.value.filter(model => !isChromeBuiltInPlaceholder(model)),
    catalog.presetsByProviderId.value
  )
)

const showEditModal = ref(false)
const modelsReady = ref(false)
const preparingLocalService = ref(false)
let localDraftGeneration = 0
watch(() => props.active, active => {
  if (!active) {
    localDraftGeneration++
    manager.cancelLocalModelRequest()
  }
})
const handleModelsSynced = async () => {
  await manager.loadModels()
  emit('modelsUpdated', visibleModels.value[0]?.id)
}
onBeforeUnmount(() => {
  localDraftGeneration++
  manager.cancelLocalModelRequest()
  if (typeof window !== 'undefined') {
    window.removeEventListener(MODELS_SYNCED_EVENT, handleModelsSynced)
  }
})
const handleLocalService = async (service: DiscoveredLocalService) => {
  if (preparingLocalService.value || showEditModal.value || !props.active) return
  preparingLocalService.value = true
  const current = ++localDraftGeneration
  try {
    const prepared = await manager.prepareForLocalService(service)
    if (!prepared || current !== localDraftGeneration || !props.active) return
    editingModelId.value = null
    showEditModal.value = true
  } catch {
    if (current === localDraftGeneration && props.active) toast.error(t('modelManager.loadFailed'))
  } finally {
    preparingLocalService.value = false
  }
}
const editingModelId = ref<string | null>(null)
const isTestingConnectionFor = (id: string) => !!manager.testingConnections.value[id]
const handleModelUpdated = async (id?: string) => {
  await manager.loadModels()
  const targetId = id || manager.models.value[0]?.id
  if (targetId) {
    emit('modelsUpdated', targetId)
  }

  // 保存成功后关闭模态框并重置表单状态
  showEditModal.value = false
  editingModelId.value = null
  manager.resetFormState()
}

const handleTestConnection = async (id: string) => {
  const runTest = async () => {
    await manager.testConfigConnection(id)
  }

  if (!isRunningInElectron()) {
    const model = manager.models.value.find(m => m.id === id)
    if (model) {
      const isCorsRestricted = !!model.providerMeta?.corsRestricted
      if (isCorsRestricted) {
        const providerName = getProviderDisplayName(model.providerMeta, t, 'Unknown Provider')
        dialog.warning({
          title: t('modelManager.corsRestrictedTag'),
          content: () => h('div', { style: 'white-space: pre-line;' }, t('modelManager.corsRestrictedConfirm', { provider: providerName })),
          positiveText: t('common.confirm'),
          negativeText: t('common.cancel'),
          // Don't block dialog close while the async test runs.
          onPositiveClick: () => {
            void runTest()
          }
        })
        return
      }
    }
  }
  await runTest()
}

const handleEditModel = async (id: string) => {
  if (isPlatformModelId(id)) return
  // 如果已经在编辑同一个模型且模态框已经打开，直接返回
  if (editingModelId.value === id && showEditModal.value === true) {
    return
  }

  // 如果切换到不同的模型，重置表单状态
  if (editingModelId.value && editingModelId.value !== id) {
    manager.resetFormState()
  }

  // 准备编辑模式（总是会执行，因为我们需要确保状态正确）
  await manager.prepareForEdit(id, true)
  editingModelId.value = id
  showEditModal.value = true
}

const updateEditModalVisibility = (value: boolean) => {
  showEditModal.value = value
  // 当模态框关闭时，重置编辑状态但不重置表单数据
  if (!value) {
    editingModelId.value = null
    manager.cancelLocalModelRequest()
  }
}

const handleCloneModel = async (id: string) => {
  if (isPlatformModelId(id)) return
  try {
    await manager.prepareForClone(id)
    showEditModal.value = true
    editingModelId.value = null
  } catch {
    // prepareForClone already handles user-facing errors
  }
}

const handleEnableModel = async (id: string) => {
  await manager.enableModel(id)
  emit('modelsUpdated', id)
}

const handleDisableModel = async (id: string) => {
  await manager.disableModel(id)
  emit('modelsUpdated', id)
}

const handleDeleteModel = async (id: string) => {
  if (isPlatformModelId(id)) return
  const confirmed = await confirmDialog.warning({
    title: t('common.warning'),
    content: t('modelManager.deleteConfirm'),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
  })
  if (!confirmed) return

  await manager.deleteModel(id)
  const firstId = visibleModels.value[0]?.id
  emit('modelsUpdated', firstId)
}

const openAddModal = async () => {
  await manager.prepareForCreate()
  editingModelId.value = null
  showEditModal.value = true
}

defineExpose({
  openAddModal,
  openEditModal: handleEditModel,
  refresh: manager.loadModels
})

onMounted(async () => {
  if (typeof window !== 'undefined') {
    window.addEventListener(MODELS_SYNCED_EVENT, handleModelsSynced)
  }
  await Promise.all([
    catalog.loadModelPresets(),
    catalog.loadPlatformModels(),
  ])
  await manager.loadProviders()
  await manager.loadModels()
  modelsReady.value = true
  const firstId = visibleModels.value[0]?.id
  if (firstId) {
    emit('modelsUpdated', firstId)
  }
})
</script>

<style scoped>
.text-model-manager {
  width: 100%;
}

.platform-models-strip {
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--gp-border-strong, rgba(15, 118, 110, 0.22));
  background: var(--gp-accent-soft, rgba(15, 118, 110, 0.07));
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.platform-models-strip__main {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 13px;
}

.platform-models-strip__badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--gp-accent, #0f766e);
  color: #ffffff;
  font-size: 11px;
  font-weight: 600;
}

.platform-models-strip__summary {
  font-weight: 600;
}

.platform-models-strip__note {
  font-size: 12px;
  opacity: 0.78;
}
</style>
