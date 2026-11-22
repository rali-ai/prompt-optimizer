import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'

vi.mock('naive-ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('naive-ui')>()

  return {
    ...actual,
    NButton: defineComponent({
      name: 'NButton',
      setup(_, { slots, attrs }) {
        return () => h('button', attrs, slots.default?.())
      },
    }),
    NBadge: defineComponent({
      name: 'NBadge',
      props: ['show'],
      setup(props, { slots }) {
        return () => h('span', { class: 'n-badge-stub', 'data-show': String(Boolean(props.show)) }, slots.default?.())
      },
    }),
    NText: defineComponent({
      name: 'NText',
      setup(_, { slots }) {
        return () => h('span', { class: 'n-text-stub' }, slots.default?.())
      },
    }),
  }
})

import AppHeaderActions from '../../../src/components/app-layout/AppHeaderActions.vue'

describe('AppHeaderActions', () => {
  it('offers one source link to the fork and no upstream links', async () => {
    const wrapper = mount(AppHeaderActions, {
      global: {
        mocks: { $t: (key: string) => key },
        stubs: {
          ThemeToggleUI: true,
          LanguageSwitchDropdown: { template: '<button data-testid="language-switch" />' },
          UpdaterIcon: true,
          ActionButtonUI: true,
          ChangePasswordButton: true,
          AccountSyncButton: true,
        },
      },
    })

    expect(wrapper.find('[data-testid="header-source-link"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="language-switch"]').exists()).toBe(true)
    expect(wrapper.html()).not.toMatch(/always200|linshenkx|GitHub|源代码/)
  })

  it('separates the favorites page destination from modal actions and marks it active', async () => {
    const wrapper = mount(AppHeaderActions, {
      props: {
        favoritesActive: true,
      },
      global: {
        mocks: {
          $t: (key: string) => {
            const map: Record<string, string> = {
              'nav.templates': 'Templates',
              'nav.history': 'History',
              'nav.modelManager': 'Model Manager',
              'nav.favorites': 'Favorite Library',
              'nav.dataManager': 'Data Manager',
              'nav.variableManager': 'Variable Manager',
            }
            return map[key] ?? key
          },
        },
        stubs: {
          ThemeToggleUI: true,
          LanguageSwitchDropdown: true,
          UpdaterIcon: true,
          ChangePasswordButton: true,
          AccountSyncButton: true,
          ActionButtonUI: defineComponent({
            name: 'ActionButtonUI',
            props: ['text', 'type'],
            emits: ['click'],
            setup(props, { emit, attrs }) {
              return () =>
                h(
                  'button',
                  {
                    ...attrs,
                    class: attrs.class,
                    'data-type': props.type,
                    onClick: () => emit('click'),
                  },
                  props.text,
                )
            },
          }),
        },
      },
    })

    const pageGroup = wrapper.find('[data-testid="header-page-destinations"]')
    const modalGroup = wrapper.find('[data-testid="header-modal-actions"]')

    expect(pageGroup.exists()).toBe(true)
    expect(modalGroup.exists()).toBe(true)
    expect(pageGroup.text()).toContain('Favorite Library')
    expect(modalGroup.text()).not.toContain('Favorite Library')
    const favoritesAction = pageGroup.find('[data-testid="header-favorites-page-action"]')
    expect(favoritesAction.attributes('data-type')).toBe('primary')
    expect(favoritesAction.attributes('aria-current')).toBe('page')
    expect(favoritesAction.attributes('title')).toBe('favorites.page.title')

    await favoritesAction.trigger('click')

    expect(wrapper.emitted('open-favorites')).toHaveLength(1)
  })

  it('marks the data manager action when an existing backup is stale', async () => {
    const wrapper = mount(AppHeaderActions, {
      props: {
        backupReminderDue: true,
      },
      global: {
        mocks: {
          $t: (key: string) => {
            const map: Record<string, string> = {
              'nav.templates': 'Templates',
              'nav.history': 'History',
              'nav.modelManager': 'Model Manager',
              'nav.favorites': 'Favorite Library',
              'nav.dataManager': 'Data Manager',
              'nav.variableManager': 'Variable Manager',
              'dataManager.backupReminder.tooltip': 'No data export in over 10 days. Export a local copy.',
            }
            return map[key] ?? key
          },
        },
        stubs: {
          ThemeToggleUI: true,
          LanguageSwitchDropdown: true,
          UpdaterIcon: true,
          ChangePasswordButton: true,
          AccountSyncButton: true,
          ActionButtonUI: defineComponent({
            name: 'ActionButtonUI',
            props: ['text', 'type'],
            emits: ['click'],
            setup(props, { emit, attrs }) {
              return () =>
                h(
                  'button',
                  {
                    ...attrs,
                    'data-type': props.type,
                    onClick: () => emit('click'),
                  },
                  props.text,
                )
            },
          }),
        },
      },
    })

    const dataManagerAction = wrapper.findAll('button').find((button) => button.text() === 'Data Manager')

    expect(wrapper.find('.n-badge-stub[data-show="true"]').exists()).toBe(true)
    expect(dataManagerAction?.attributes('data-type')).toBe('warning')
    expect(dataManagerAction?.attributes('title')).toBe('No data export in over 10 days. Export a local copy.')

    await dataManagerAction!.trigger('click')

    expect(wrapper.emitted('open-data-manager')).toHaveLength(1)
  })
})
