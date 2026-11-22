import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildPromptGardenCatalogUrl,
  fetchPromptGardenSuggestions,
  fetchPromptGardenCatalog,
  fetchPromptGardenPreview,
} from '../../../src/utils/prompt-garden-suggestions'

const item = (code: string, extra: Record<string, unknown> = {}) => ({
  id: code,
  title: `Title ${code}`,
  summary: `Summary ${code}`,
  importCode: code,
  mode: 'image-text2image',
  ...extra,
})

const stubCatalog = (data: unknown) => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => data })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('prompt-garden-suggestions', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('builds the static catalog path from the workspace and the content language', () => {
    expect(buildPromptGardenCatalogUrl('https://goprmpt.com/', 'image-text2image', 'zh-TW')).toBe(
      'https://goprmpt.com/api/public/prompts/catalog/zh/image-text2image.json',
    )
    expect(buildPromptGardenCatalogUrl('https://goprmpt.com', 'arena', 'en-US')).toBe(
      'https://goprmpt.com/api/public/prompts/catalog/en/arena.json',
    )
    expect(buildPromptGardenCatalogUrl('https://goprmpt.com', 'arena')).toBe(
      'https://goprmpt.com/api/public/prompts/catalog/en/arena.json',
    )
  })

  it('picks suggestions from the catalog, normalizes them and puts already shown prompts last', async () => {
    const fetchMock = stubCatalog({
      items: [
        item('a', {
          tags: ['portrait', 'cinematic', 'portrait'],
          thumbnailUrl: '/prompt-assets/thumb.webp',
          previewUrl: '/prompt-assets/preview.webp',
        }),
        item('b'),
        item('c'),
        { id: 'missing-code', title: 'Invalid', summary: 'No code' },
      ],
      browseUrl: '/library/?type=image',
    })

    const result = await fetchPromptGardenSuggestions({
      gardenBaseUrl: 'https://goprmpt.com',
      mode: 'image-text2image',
      limit: 2,
      exclude: ['b', 'c'],
      locale: 'zh-CN',
      timeoutMs: 1000,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://goprmpt.com/api/public/prompts/catalog/zh/image-text2image.json',
      expect.objectContaining({ method: 'GET', headers: { Accept: 'application/json' } }),
    )
    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toMatchObject({
      importCode: 'a',
      tags: ['portrait', 'cinematic'],
      thumbnailUrl: 'https://goprmpt.com/prompt-assets/thumb.webp',
      previewUrl: 'https://goprmpt.com/prompt-assets/preview.webp',
    })
    expect(['b', 'c']).toContain(result.items[1].importCode)
    expect(result.browseUrl).toBe('https://goprmpt.com/library/?type=image')
    expect(result.nextExclude).toEqual([])
    expect(result.ttlSeconds).toBeNull()
  })

  it('falls back to the prompt library page when the catalog omits browseUrl', async () => {
    stubCatalog({ items: [] })

    const result = await fetchPromptGardenSuggestions({
      gardenBaseUrl: 'https://goprmpt.com',
      mode: 'image-image2image',
    })

    expect(result.items).toEqual([])
    expect(result.browseUrl).toBe('https://goprmpt.com/library/')
  })

  it('searches and pages the catalog locally, keeping image and text metadata', async () => {
    const fetchMock = stubCatalog({
      items: [
        item('BM-1', {
          title: '煤炭推理',
          excerpt: 'The full question starts here',
          categoryPath: ['Evaluation', 'Reasoning'],
          thumbnailUrl: '/cover.webp',
        }),
        item('BM-2', { title: '煤 & 水', tags: ['logic'] }),
        item('BM-3', { summary: 'Unrelated' }),
      ],
      browseUrl: '/library/',
    })

    const firstPage = await fetchPromptGardenCatalog({
      gardenBaseUrl: 'https://goprmpt.com/',
      mode: 'arena',
      query: '煤',
      locale: 'zh-CN',
      limit: 1,
    })
    expect(fetchMock.mock.calls[0][0]).toBe('https://goprmpt.com/api/public/prompts/catalog/zh/arena.json')
    expect(firstPage).toMatchObject({ total: 2, nextOffset: 1 })
    expect(firstPage.items[0]).toMatchObject({
      importCode: 'BM-1',
      excerpt: 'The full question starts here',
      categoryPath: ['Evaluation', 'Reasoning'],
      thumbnailUrl: 'https://goprmpt.com/cover.webp',
    })

    const lastPage = await fetchPromptGardenCatalog({
      gardenBaseUrl: 'https://goprmpt.com',
      mode: 'arena',
      query: '煤 LOGIC',
      offset: 0,
      limit: 20,
    })
    expect(lastPage.items.map((entry) => entry.importCode)).toEqual(['BM-2'])
    expect(lastPage.nextOffset).toBeNull()
  })

  it('rejects a catalog without items and reads full prompt text only from the existing source contract', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ total: 20 }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          schema: 'prompt-garden.prompt.v1',
          schemaVersion: 1,
          prompt: {
            format: 'messages',
            messages: [
              { content: 'System instructions' },
              { content: '<script>source only</script>' },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({ ok: false, status: 503 })
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      fetchPromptGardenCatalog({ gardenBaseUrl: 'https://goprmpt.com', mode: 'arena' }),
    ).rejects.toThrow('Invalid Garden catalog response')
    await expect(
      fetchPromptGardenPreview('https://goprmpt.com', 'ZH-BM-1'),
    ).resolves.toBe('System instructions\n\n<script>source only</script>')
    await expect(
      fetchPromptGardenPreview('https://goprmpt.com', 'ZH-BM-2'),
    ).rejects.toThrow('503')
  })
})
