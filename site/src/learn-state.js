export const TRACK_IDS = ['course', 'pattern']

export function parseLearnUrlState(search = '', hash = '', lessonById = new Map()) {
  const params = new URLSearchParams(search)

  let hashId = ''
  if (hash && hash.length > 1) {
    try {
      hashId = decodeURIComponent(hash.replace(/^#/, '')).trim()
    } catch {
      hashId = hash.replace(/^#/, '').trim()
    }
  }

  const id = (params.get('id') ?? '').trim() || hashId
  const matched = id ? lessonById.get(id) : undefined
  if (matched) {
    return { track: matched.track, id }
  }

  const rawTrack = (params.get('track') ?? '').trim()
  const track = TRACK_IDS.includes(rawTrack) ? rawTrack : 'course'
  return { track, id }
}

export function buildLearnUrlSearch({ track = 'course', id = '' } = {}) {
  const params = new URLSearchParams()
  if (track === 'pattern') params.set('track', 'pattern')
  if (id) params.set('id', id)
  const serialized = params.toString()
  return serialized ? `?${serialized}` : ''
}
