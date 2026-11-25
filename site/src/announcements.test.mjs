import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ANNOUNCEMENTS_API_URL,
  pickVisibleAnnouncement,
  renderAnnouncementBannerHtml
} from './shell.js'

const NOW = 1_750_000_000_000

const sampleAnnouncements = [
  {
    id: 'notice-old',
    title: '常规通知',
    content: '版本已更新',
    type: 'notice',
    linkUrl: 'https://goprmpt.com/guide/',
    linkText: '阅读更新',
    isActive: true,
    isPinned: false,
    expiresAt: null,
    createdAt: NOW - 10_000,
    updatedAt: NOW - 5_000
  },
  {
    id: 'activity-pinned',
    title: '春季共创活动',
    content: '提交提示词赢取会员时长',
    type: 'activity',
    linkUrl: 'https://goprmpt.com/library/',
    linkText: '参与活动',
    isActive: true,
    isPinned: true,
    expiresAt: NOW + 60_000,
    createdAt: NOW - 20_000,
    updatedAt: NOW - 15_000
  },
  {
    id: 'notice-newer',
    title: '最新通知',
    content: '新增 26 节双语教程',
    type: 'notice',
    linkUrl: null,
    linkText: null,
    isActive: true,
    isPinned: false,
    expiresAt: null,
    createdAt: NOW - 2_000,
    updatedAt: NOW - 1_000
  }
]

test('ANNOUNCEMENTS_API_URL targets goprmpt.net active announcements endpoint', () => {
  assert.equal(ANNOUNCEMENTS_API_URL, 'https://goprmpt.net/user-api/announcements/active')
})

test('pickVisibleAnnouncement prioritizes pinned, then newest updatedAt, and skips dismissed or inactive items', () => {
  assert.equal(pickVisibleAnnouncement(null, []), null)
  assert.equal(pickVisibleAnnouncement([], []), null)

  // Pinned announcement wins even with older updatedAt
  const top = pickVisibleAnnouncement(sampleAnnouncements, [], NOW)
  assert.equal(top?.id, 'activity-pinned')

  // Dismissing pinned reveals newest unpinned
  const afterDismissPinned = pickVisibleAnnouncement(
    sampleAnnouncements,
    [`activity-pinned:${NOW - 15_000}`],
    NOW
  )
  assert.equal(afterDismissPinned?.id, 'notice-newer')

  // Works with Set as well
  const afterDismissTwo = pickVisibleAnnouncement(
    sampleAnnouncements,
    new Set([`activity-pinned:${NOW - 15_000}`, `notice-newer:${NOW - 1_000}`]),
    NOW
  )
  assert.equal(afterDismissTwo?.id, 'notice-old')

  // Updated timestamp resurfaces a previously dismissed announcement
  const edited = [
    { ...sampleAnnouncements[1], updatedAt: NOW - 500 }
  ]
  assert.equal(
    pickVisibleAnnouncement(edited, [`activity-pinned:${NOW - 15_000}`], NOW)?.id,
    'activity-pinned'
  )

  // Inactive, expired, and malformed entries are skipped
  const filteredOut = [
    { id: 'inactive', title: 'Off', isActive: false, isPinned: true, updatedAt: NOW },
    { id: 'expired', title: 'Past', isActive: true, expiresAt: NOW - 1, updatedAt: NOW },
    { id: '', title: 'Missing ID', isActive: true, updatedAt: NOW },
    null
  ]
  assert.equal(pickVisibleAnnouncement(filteredOut, [], NOW), null)
})

test('renderAnnouncementBannerHtml formats zh-CN and en banners with type classes and default link labels', () => {
  const zhHtml = renderAnnouncementBannerHtml(sampleAnnouncements[1], 'zh-CN')
  assert.match(zhHtml, /class="site-announcement-bar site-announcement-bar--activity"/)
  assert.match(zhHtml, /<span class="site-announcement-bar__pill">活动<\/span>/)
  assert.match(zhHtml, /春季共创活动/)
  assert.match(zhHtml, /提交提示词赢取会员时长/)
  assert.match(
    zhHtml,
    /<a class="site-announcement-bar__link" href="https:\/\/goprmpt\.com\/library\/" target="_blank" rel="noopener noreferrer">参与活动<span aria-hidden="true"> →<\/span><\/a>/
  )
  assert.match(
    zhHtml,
    /data-dismiss-announcement="activity-pinned:1749999985000"/
  )

  const maintenanceEn = renderAnnouncementBannerHtml(
    {
      id: 'm1',
      title: 'Scheduled maintenance',
      content: 'Brief restart at 03:00 UTC',
      type: 'maintenance',
      linkUrl: 'https://goprmpt.com/guide/',
      linkText: null,
      updatedAt: 42
    },
    'en'
  )
  assert.match(maintenanceEn, /site-announcement-bar--maintenance/)
  assert.match(maintenanceEn, /<span class="site-announcement-bar__pill">Maintenance<\/span>/)
  assert.match(maintenanceEn, />Learn more<span aria-hidden="true"> →<\/span><\/a>/)
  assert.match(maintenanceEn, /aria-label="Dismiss announcement"/)

  assert.equal(renderAnnouncementBannerHtml(null, 'zh-CN'), '')
  assert.equal(renderAnnouncementBannerHtml({ id: 'x', title: '' }, 'zh-CN'), '')
})

test('renderAnnouncementBannerHtml strictly escapes HTML and strips unsafe link protocols', () => {
  const xssHtml = renderAnnouncementBannerHtml(
    {
      id: 'x"<1>',
      title: '<img src=x onerror=alert(1)> & "bold"',
      content: '<script>evil()</script>',
      type: 'bad-type',
      linkUrl: 'javascript:alert(document.cookie)',
      linkText: '<b>Click</b>',
      updatedAt: 99
    },
    'zh-CN'
  )

  // Falls back to notice class
  assert.match(xssHtml, /site-announcement-bar--notice/)
  // No raw HTML tags injected
  assert.equal(xssHtml.includes('<script>'), false)
  assert.equal(xssHtml.includes('<img'), false)
  assert.equal(xssHtml.includes('javascript:'), false)
  assert.equal(xssHtml.includes('<a '), false)
  // Properly escaped text entities present
  assert.ok(xssHtml.includes('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;bold&quot;'))
  assert.ok(xssHtml.includes('&lt;script&gt;evil()&lt;/script&gt;'))
  assert.ok(xssHtml.includes('data-dismiss-announcement="x&quot;&lt;1&gt;:99"'))

  // Also test data: URL rejection and http: allowance with escaped linkText
  const dataUrlHtml = renderAnnouncementBannerHtml(
    {
      id: 'd1',
      title: 'Data URL check',
      content: '',
      type: 'notice',
      linkUrl: 'data:text/html,<script>1</script>',
      linkText: 'Nope',
      updatedAt: 1
    },
    'en'
  )
  assert.equal(dataUrlHtml.includes('<a '), false)

  const httpHtml = renderAnnouncementBannerHtml(
    {
      id: 'h1',
      title: 'HTTP check',
      content: '',
      type: 'notice',
      linkUrl: 'http://example.com/a?x=1&y=2',
      linkText: '<Go>',
      updatedAt: 1
    },
    'en'
  )
  assert.ok(httpHtml.includes('href="http://example.com/a?x=1&amp;y=2"'))
  assert.ok(httpHtml.includes('&lt;Go&gt;'))
})
