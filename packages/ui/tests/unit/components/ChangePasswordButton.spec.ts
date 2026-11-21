import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

vi.mock('naive-ui', async (importOriginal) => ({
  ...await importOriginal<typeof import('naive-ui')>(),
  NButton: { template: '<button><slot /></button>' },
  NModal: { props: ['show', 'title'], template: '<div v-if="show" role="dialog"><slot /><slot name="footer" /></div>' },
  NForm: { template: '<form><slot /></form>' },
  NFormItem: { props: ['label'], template: '<label>{{ label }}<slot /></label>' },
  NInput: {
    props: ['value'],
    emits: ['update:value'],
    template: '<input :value="value" @input="$emit(\'update:value\', $event.target.value)" />',
  },
  NSpace: { template: '<div><slot /></div>' },
  NAlert: { props: ['type'], template: '<div :data-type="type"><slot /></div>' },
}))

import ChangePasswordButton from '../../../src/components/app-layout/ChangePasswordButton.vue'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const mountWithStatus = async (status: () => Promise<Response>) => {
  const fetchMock = vi.fn((url: string) => (url === '/auth-api/status' ? status() : Promise.reject(new Error(url))))
  vi.stubGlobal('fetch', fetchMock)
  const wrapper = mount(ChangePasswordButton)
  await flushPromises()
  return { wrapper, fetchMock }
}

const fillAndSubmit = async (wrapper: ReturnType<typeof mount>, current: string, next: string, confirm: string) => {
  await wrapper.get('[data-testid="header-change-password"]').trigger('click')
  await wrapper.get('[data-testid="change-password-current"]').setValue(current)
  await wrapper.get('[data-testid="change-password-new"]').setValue(next)
  await wrapper.get('[data-testid="change-password-confirm"]').setValue(confirm)
  await wrapper.get('[data-testid="change-password-submit"]').trigger('click')
  await flushPromises()
}

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout'] }))
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('ChangePasswordButton', () => {
  it.each([
    ['the auth API is missing', () => Promise.resolve(new Response('not found', { status: 404 }))],
    ['the dev server answers with the SPA page', () => Promise.resolve(new Response('<!doctype html>', { status: 200 }))],
    ['the request fails', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['auth is disabled', () => Promise.resolve(json(200, { enabled: false }))],
  ])('stays hidden when %s', async (_, status) => {
    const { wrapper } = await mountWithStatus(status)
    expect(wrapper.find('[data-testid="header-change-password"]').exists()).toBe(false)
  })

  it.each([
    ['', 'new-password-1', 'new-password-1', '请输入当前密码'],
    ['old-password', 'short', 'short', '新密码长度需为 8 到 128 个字符'],
    ['old-password', 'x'.repeat(129), 'x'.repeat(129), '新密码长度需为 8 到 128 个字符'],
    ['old-password', 'has:colon!', 'has:colon!', '新密码不能包含冒号（:）'],
    ['old-password', 'new-password-1', 'new-password-2', '两次输入的新密码不一致'],
  ])('rejects invalid input locally (%s / %s / %s)', async (current, next, confirm, message) => {
    const { wrapper, fetchMock } = await mountWithStatus(() => Promise.resolve(json(200, { enabled: true, username: 'admin' })))

    await fillAndSubmit(wrapper, current, next, confirm)

    expect(wrapper.get('[data-testid="change-password-notice"]').text()).toBe(message)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('shows the server error text', async () => {
    const { wrapper, fetchMock } = await mountWithStatus(() => Promise.resolve(json(200, { enabled: true, username: 'admin' })))
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(url === '/auth-api/password' ? json(403, { error: '当前密码不正确' }) : json(200, { enabled: true })),
    )

    await fillAndSubmit(wrapper, 'wrong-password', 'new-password-1', 'new-password-1')

    const notice = wrapper.get('[data-testid="change-password-notice"]')
    expect(notice.text()).toBe('当前密码不正确')
    expect(notice.attributes('data-type')).toBe('error')
  })

  it('posts the passwords and announces the re-login on success', async () => {
    const { wrapper, fetchMock } = await mountWithStatus(() => Promise.resolve(json(200, { enabled: true, username: 'admin' })))
    fetchMock.mockImplementation(() => Promise.resolve(json(200, { ok: true })))

    await fillAndSubmit(wrapper, 'old-password', 'new-password-1', 'new-password-1')

    const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(url).toBe('/auth-api/password')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ currentPassword: 'old-password', newPassword: 'new-password-1' })
    const notice = wrapper.get('[data-testid="change-password-notice"]')
    expect(notice.text()).toBe('密码已修改，请使用新密码重新登录')
    expect(notice.attributes('data-type')).toBe('success')
    expect(vi.getTimerCount()).toBe(1)
  })
})
