import { chromium, test, expect, type Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const MENU_IDS = ['goprmpt-optimize-selection', 'goprmpt-open-app']
const selection = '帮我写一封请假邮件 & 50% off? a+b #1'

const editor = (page: Page) => page.getByTestId('basic-user-input')

async function readPrompt(page: Page) {
  const textarea = editor(page).locator('textarea')
  if (await textarea.count()) return textarea.first().inputValue()
  return editor(page).locator('.cm-content').innerText()
}

async function editPrompt(page: Page, value: string) {
  const textarea = editor(page).locator('textarea')
  if (await textarea.count()) await textarea.first().fill(value)
  else {
    await editor(page).locator('.cm-content').click()
    await page.keyboard.press('Control+A')
    await page.keyboard.insertText(value)
  }
  await expect.poll(() => readPrompt(page)).toBe(value)
}

test('context menu selection opens the basic-user workspace prefilled over a saved session', async () => {
  const extension = resolve('packages/extension/dist')
  // A short profile path: IndexedDB fails past the Windows MAX_PATH under deep checkouts.
  const profile = mkdtempSync(join(tmpdir(), 'po-ext-'))
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true, timeout: 15000,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  })
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 10000 })
    const app = `chrome-extension://${new URL(worker.url()).host}/index.html`

    // update() rejects for an unknown id, so this proves both menus were registered on install.
    await expect.poll(() => worker.evaluate(async (ids) => {
      try {
        for (const id of ids) await chrome.contextMenus.update(id, {})
        return true
      } catch {
        return false
      }
    }, MENU_IDS)).toBe(true)

    const existing = await context.newPage()
    await existing.goto(`${app}#/basic/user`)
    await expect(editor(existing)).toBeVisible({ timeout: 20000 })
    await editPrompt(existing, 'older saved prompt')
    expect(await existing.evaluate(() => {
      const app = document.querySelector('#app') as HTMLElement & { __vue_app__: any }
      return app.__vue_app__.config.globalProperties.$pinia._s.get('basicUserSession').saveSession()
    })).toBe(true)
    await existing.reload()
    await expect(editor(existing)).toBeVisible({ timeout: 20000 })
    await expect.poll(() => readPrompt(existing)).toBe('older saved prompt')
    await existing.close()

    // A headless test cannot click a native context menu; background.js opens this URL for it.
    const page = await context.newPage()
    await page.goto(`${app}#/basic/user?prompt=${encodeURIComponent(selection)}`)
    await expect(editor(page)).toBeVisible({ timeout: 20000 })
    await expect.poll(() => readPrompt(page)).toBe(selection)
    await expect.poll(() => new URL(page.url()).hash).toBe('#/basic/user')

    await page.reload()
    await expect(editor(page)).toBeVisible({ timeout: 20000 })
    await expect.poll(() => readPrompt(page)).toBe(selection)
  } finally {
    await context.close()
    rmSync(profile, { recursive: true, force: true })
  }
})
