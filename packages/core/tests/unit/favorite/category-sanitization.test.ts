import { describe, expect, it } from 'vitest'
import { FavoriteManager, sanitizeCategoryName } from '../../../src/services/favorite/manager'
import { FavoriteImportExportError, FavoriteValidationError } from '../../../src/services/favorite/errors'
import { MemoryStorageProvider } from '../../../src/services/storage/memoryStorageProvider'

describe('FavoriteManager category name sanitization', () => {
  it('strips angle brackets, control characters, and outer whitespace in addCategory', async () => {
    const manager = new FavoriteManager(new MemoryStorageProvider())

    const id = await manager.addCategory({
      name: '  \x00<img src=x onerror=alert(1)>\x1f\x7f  ',
      sortOrder: 1,
    })

    const saved = (await manager.getCategories()).find((cat) => cat.id === id)
    expect(saved).toBeDefined()
    expect(saved!.name).toBe('img src=x onerror=alert(1)')
    expect(saved!.name).not.toContain('<')
    expect(saved!.name).not.toContain('>')
  })

  it('rejects duplicate names after sanitization and rejects empty or overly long names', async () => {
    const manager = new FavoriteManager(new MemoryStorageProvider())

    await manager.addCategory({ name: 'Work', sortOrder: 1 })
    await expect(manager.addCategory({ name: '  <Work>\x07 ', sortOrder: 2 })).rejects.toThrow(
      FavoriteValidationError,
    )
    await expect(manager.addCategory({ name: ' <>\x00\x1f ', sortOrder: 3 })).rejects.toThrow(
      FavoriteValidationError,
    )
    await expect(manager.addCategory({ name: 'a'.repeat(51), sortOrder: 4 })).rejects.toThrow(
      FavoriteValidationError,
    )
  })

  it('sanitizes and validates category names on updateCategory', async () => {
    const manager = new FavoriteManager(new MemoryStorageProvider())
    const id = await manager.addCategory({ name: 'Initial', sortOrder: 1 })

    await manager.updateCategory(id, {
      name: '\t<img src=x onerror=alert(1)>\n',
    })
    let saved = (await manager.getCategories()).find((cat) => cat.id === id)
    expect(saved!.name).toBe('img src=x onerror=alert(1)')
    expect(saved!.name).not.toContain('<')
    expect(saved!.name).not.toContain('>')

    // Updating non-name fields leaves name intact
    await manager.updateCategory(id, { description: 'Updated desc' })
    saved = (await manager.getCategories()).find((cat) => cat.id === id)
    expect(saved!.name).toBe('img src=x onerror=alert(1)')
    expect(saved!.description).toBe('Updated desc')

    await expect(manager.updateCategory(id, { name: '<><>' })).rejects.toThrow(FavoriteValidationError)
    await expect(manager.updateCategory(id, { name: 'b'.repeat(51) })).rejects.toThrow(
      FavoriteValidationError,
    )
  })

  it('sanitizes imported category names and rejects invalid names in validateImportData and importFavorites', async () => {
    const manager = new FavoriteManager(new MemoryStorageProvider())
    const payload = JSON.stringify({
      version: '1.0',
      favorites: [],
      categories: [
        {
          id: 'cat-xss',
          name: ' \x01<img src=x onerror=alert(1)>\x7f ',
          sortOrder: 0,
        },
      ],
      tags: [],
    })

    await expect(manager.validateImportData(payload)).resolves.toBeUndefined()
    await manager.importFavorites(payload)

    const imported = (await manager.getCategories()).find((cat) => cat.id === 'cat-xss')
    expect(imported).toBeDefined()
    expect(imported!.name).toBe('img src=x onerror=alert(1)')
    expect(imported!.name).not.toContain('<')
    expect(imported!.name).not.toContain('>')

    const emptyAfterStripPayload = JSON.stringify({
      version: '1.0',
      favorites: [],
      categories: [{ id: 'cat-empty', name: '<>\x00', sortOrder: 0 }],
      tags: [],
    })
    await expect(manager.validateImportData(emptyAfterStripPayload)).rejects.toThrow(
      FavoriteValidationError,
    )
    await expect(manager.importFavorites(emptyAfterStripPayload)).rejects.toThrow(
      FavoriteImportExportError,
    )

    const tooLongPayload = JSON.stringify({
      version: '1.0',
      favorites: [],
      categories: [{ id: 'cat-long', name: 'x'.repeat(51), sortOrder: 0 }],
      tags: [],
    })
    await expect(manager.validateImportData(tooLongPayload)).rejects.toThrow(FavoriteValidationError)
    await expect(manager.importFavorites(tooLongPayload)).rejects.toThrow(FavoriteImportExportError)
  })

  it('preserves valid CJK and emoji category names up to 50 characters', () => {
    expect(sanitizeCategoryName('  常用提示词 🚀  ')).toBe('常用提示词 🚀')
    expect(sanitizeCategoryName('a'.repeat(50))).toHaveLength(50)
  })
})
