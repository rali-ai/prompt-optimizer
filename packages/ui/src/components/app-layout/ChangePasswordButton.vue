<template>
    <!--
        修改访问密码（仅自托管 Web 部署可见）

        服务端约定:
        - GET  /auth-api/status   -> 200 {"enabled":true,"username":"admin"} | {"enabled":false}
        - POST /auth-api/password -> 200 {"ok":true} | 400/403/500 {"error":"中文说明"}
        桌面版、浏览器扩展和本地开发环境没有该接口，按钮保持隐藏。
    -->
    <template v-if="enabled">
        <NButton
            quaternary
            size="small"
            class="change-password-trigger"
            data-testid="header-change-password"
            @click="openModal"
        >
            修改密码
        </NButton>
        <NModal
            v-model:show="showModal"
            preset="card"
            title="修改密码"
            :mask-closable="false"
            :closable="!submitting"
            :style="{ width: 'min(420px, 90vw)' }"
        >
            <NForm label-placement="top" @submit.prevent="submit">
                <NFormItem label="当前密码">
                    <NInput
                        v-model:value="form.currentPassword"
                        type="password"
                        show-password-on="click"
                        :input-props="{ autocomplete: 'current-password' }"
                        data-testid="change-password-current"
                    />
                </NFormItem>
                <NFormItem label="新密码">
                    <NInput
                        v-model:value="form.newPassword"
                        type="password"
                        show-password-on="click"
                        placeholder="8 到 128 个字符，不能包含冒号"
                        :input-props="{ autocomplete: 'new-password' }"
                        data-testid="change-password-new"
                    />
                </NFormItem>
                <NFormItem label="确认新密码">
                    <NInput
                        v-model:value="form.confirmPassword"
                        type="password"
                        show-password-on="click"
                        :input-props="{ autocomplete: 'new-password' }"
                        data-testid="change-password-confirm"
                    />
                </NFormItem>
            </NForm>
            <NAlert
                v-if="notice"
                :type="notice.type"
                :show-icon="false"
                data-testid="change-password-notice"
            >
                {{ notice.text }}
            </NAlert>
            <template #footer>
                <NSpace justify="end">
                    <NButton :disabled="submitting || succeeded" @click="showModal = false">取消</NButton>
                    <NButton
                        type="primary"
                        :loading="submitting"
                        :disabled="succeeded"
                        data-testid="change-password-submit"
                        @click="submit"
                    >
                        确认修改
                    </NButton>
                </NSpace>
            </template>
        </NModal>
    </template>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { NAlert, NButton, NForm, NFormItem, NInput, NModal, NSpace } from 'naive-ui'

const RELOAD_DELAY_MS = 1500

const enabled = ref(false)
const showModal = ref(false)
const submitting = ref(false)
const succeeded = ref(false)
const notice = ref<{ type: 'error' | 'success'; text: string } | null>(null)
const form = reactive({ currentPassword: '', newPassword: '', confirmPassword: '' })

onMounted(async () => {
    try {
        const response = await fetch('/auth-api/status', { headers: { Accept: 'application/json' } })
        if (!response.ok) return
        const status: unknown = await response.json()
        enabled.value = (status as { enabled?: unknown } | null)?.enabled === true
    } catch {
        // No auth API here (desktop, extension or dev build): keep the button hidden.
    }
})

const openModal = () => {
    form.currentPassword = ''
    form.newPassword = ''
    form.confirmPassword = ''
    notice.value = null
    showModal.value = true
}

const validate = (): string | null => {
    if (!form.currentPassword) return '请输入当前密码'
    if (form.newPassword.length < 8 || form.newPassword.length > 128) return '新密码长度需为 8 到 128 个字符'
    if (form.newPassword.includes(':')) return '新密码不能包含冒号（:）'
    if (form.newPassword !== form.confirmPassword) return '两次输入的新密码不一致'
    return null
}

const submit = async () => {
    if (submitting.value || succeeded.value) return
    const problem = validate()
    if (problem) {
        notice.value = { type: 'error', text: problem }
        return
    }

    submitting.value = true
    notice.value = null
    try {
        const response = await fetch('/auth-api/password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }),
        })
        const body = (await response.json().catch(() => null)) as { ok?: unknown; error?: unknown } | null
        if (response.ok && body?.ok === true) {
            succeeded.value = true
            notice.value = { type: 'success', text: '密码已修改，请使用新密码重新登录' }
            // The browser drops the stale Basic credentials and prompts again on reload.
            setTimeout(() => window.location.reload(), RELOAD_DELAY_MS)
            return
        }
        notice.value = {
            type: 'error',
            text: typeof body?.error === 'string' && body.error ? body.error : `修改失败（HTTP ${response.status}）`,
        }
    } catch {
        notice.value = { type: 'error', text: '网络错误，请稍后重试' }
    } finally {
        submitting.value = false
    }
}
</script>

<style scoped>
.change-password-trigger {
    flex-shrink: 0;
    font-size: 12px;
}
</style>
