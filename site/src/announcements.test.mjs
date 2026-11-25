import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ANNOUNCEMENTS_API_URL,
  ANNOUNCEMENT_COMMENTS_API_BASE,
  pickVisibleAnnouncement,
  renderAnnouncementBannerHtml,
  renderAnnouncementCommentsHtml,
  safeCommentImageSrc
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

test('ANNOUNCEMENT_COMMENTS_API_BASE and renderAnnouncementBannerHtml include comment toggle and hidden panel', () => {
  assert.equal(ANNOUNCEMENT_COMMENTS_API_BASE, 'https://goprmpt.net/user-api/announcements')

  const zhWithCount = renderAnnouncementBannerHtml(
    {
      id: 'ann-42',
      title: '新功能上线',
      content: '支持评论互动',
      type: 'notice',
      commentCount: 7,
      updatedAt: 100
    },
    'zh-CN'
  )
  assert.match(zhWithCount, /class="site-announcement-bar__row"/)
  assert.match(
    zhWithCount,
    /<button class="site-announcement-bar__comments-btn" type="button" data-toggle-announcement-comments="ann-42" aria-expanded="false">评论 \(7\)<\/button>/
  )
  assert.match(
    zhWithCount,
    /<div class="site-announcement-comments" data-announcement-comments="ann-42" hidden><\/div>/
  )

  const zhZero = renderAnnouncementBannerHtml(
    { id: 'ann-0', title: '无评论', content: '', commentCount: 0, updatedAt: 1 },
    'zh-CN'
  )
  assert.match(zhZero, />评论<\/button>/)

  const enWithCount = renderAnnouncementBannerHtml(
    { id: 'ann-en', title: 'Update', content: 'Comments ready', commentCount: 3, updatedAt: 1 },
    'en'
  )
  assert.match(enWithCount, />Comments \(3\)<\/button>/)
})

test('renderAnnouncementCommentsHtml renders bilingual states, badges, CTA link, and strictly escapes XSS', () => {
  const emptyZh = renderAnnouncementCommentsHtml([], 'zh-CN')
  assert.match(emptyZh, /评论区 \(0\)/)
  assert.match(emptyZh, /暂无评论/)
  assert.match(
    emptyZh,
    /<a class="site-announcement-comments__cta" href="https:\/\/goprmpt\.net" target="_blank" rel="noopener noreferrer">注册 \/ 登录后参与评论 →<\/a>/
  )

  const emptyEn = renderAnnouncementCommentsHtml(null, 'en')
  assert.match(emptyEn, /Comments \(0\)/)
  assert.match(emptyEn, /No comments yet/)
  assert.match(emptyEn, /Sign up \/ Sign in to comment →/)

  const xssComments = [
    {
      id: 'c1',
      announcementId: 'ann-1',
      userId: 'u1',
      username: '<img src=x onerror=alert(1)>',
      role: 'admin',
      tier: 'internal',
      effectiveTier: 'internal',
      content: '<script>alert("xss")</script>\n安全换行 & 引号',
      createdAt: 1750000000000
    },
    {
      id: 'c2',
      announcementId: 'ann-1',
      userId: 'u2',
      username: 'alice',
      role: 'user',
      tier: 'pro',
      effectiveTier: 'pro',
      content: '非常好用！',
      createdAt: 1750000060000
    },
    { id: 'bad', username: '', content: 'skip' }
  ]

  const zhHtml = renderAnnouncementCommentsHtml(xssComments, 'zh-CN')
  assert.match(zhHtml, /评论区 \(2\)/)
  assert.equal(zhHtml.includes('<script>'), false)
  assert.equal(zhHtml.includes('<img'), false)
  assert.ok(zhHtml.includes('&lt;img src=x onerror=alert(1)&gt;'))
  assert.ok(zhHtml.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;\n安全换行 &amp; 引号'))
  assert.match(zhHtml, /site-announcement-comments__badge--admin">管理员<\/span>/)
  assert.match(zhHtml, /site-announcement-comments__badge--pro">专业会员<\/span>/)

  const enHtml = renderAnnouncementCommentsHtml(xssComments, 'en')
  assert.match(enHtml, /Comments \(2\)/)
  assert.match(enHtml, /site-announcement-comments__badge--admin">Admin<\/span>/)
  assert.match(enHtml, /site-announcement-comments__badge--pro">Pro<\/span>/)
})

test('safeCommentImageSrc allows only goprmpt.net comment-images paths and rejects unsafe URLs', () => {
  assert.equal(
    safeCommentImageSrc('/user-api/announcements/comment-images/img-abc123'),
    'https://goprmpt.net/user-api/announcements/comment-images/img-abc123'
  )
  assert.equal(
    safeCommentImageSrc('https://goprmpt.net/user-api/announcements/comment-images/img-99'),
    'https://goprmpt.net/user-api/announcements/comment-images/img-99'
  )

  for (const bad of [
    'http://goprmpt.net/user-api/announcements/comment-images/img-1',
    'https://evil.com/user-api/announcements/comment-images/img-1',
    'https://goprmpt.net/other/path/img-1',
    'https://goprmpt.net/user-api/announcements/comment-images/img-1?x=1',
    'https://goprmpt.net/user-api/announcements/comment-images/img-1#hash',
    'https://goprmpt.net/user-api/announcements/comment-images/a/../b',
    '/user-api/announcements/comment-images/../secret',
    'javascript:alert(1)',
    'data:image/png;base64,AAA',
    '//goprmpt.net/user-api/announcements/comment-images/img-1',
    '',
    null,
    undefined
  ]) {
    assert.equal(safeCommentImageSrc(bad), null, `expected null for ${String(bad)}`)
  }
})

test('renderAnnouncementCommentsHtml renders safe image thumbnails, image-only comments, and strips unsafe imageUrl', () => {
  const comments = [
    {
      id: 'c-both',
      username: 'alice',
      role: 'user',
      tier: 'pro',
      effectiveTier: 'pro',
      content: '附一张截图 📸',
      imageUrl: '/user-api/announcements/comment-images/img-100',
      createdAt: 1750000000000
    },
    {
      id: 'c-img-only',
      username: 'bob',
      role: 'user',
      tier: 'standard',
      effectiveTier: 'standard',
      content: '',
      imageUrl: 'https://goprmpt.net/user-api/announcements/comment-images/img-200',
      createdAt: 1750000060000
    },
    {
      id: 'c-unsafe-with-text',
      username: 'charlie',
      role: 'user',
      tier: 'free',
      effectiveTier: 'free',
      content: '仅保留安全文本',
      imageUrl: 'https://evil.example/evil.png',
      createdAt: 1750000120000
    },
    {
      id: 'c-unsafe-only',
      username: 'mallory',
      role: 'user',
      tier: 'free',
      effectiveTier: 'free',
      content: '   ',
      imageUrl: 'javascript:alert(1)',
      createdAt: 1750000180000
    }
  ]

  const zhHtml = renderAnnouncementCommentsHtml(comments, 'zh-CN')
  assert.match(zhHtml, /评论区 \(3\)/)
  assert.ok(
    zhHtml.includes(
      '<p class="site-announcement-comment__text">附一张截图 📸</p>'
    )
  )
  assert.ok(
    zhHtml.includes(
      '<a class="site-announcement-comment__img-link" href="https://goprmpt.net/user-api/announcements/comment-images/img-100" target="_blank" rel="noopener noreferrer"><img class="site-announcement-comment__img" src="https://goprmpt.net/user-api/announcements/comment-images/img-100" loading="lazy" alt="评论图片" /></a>'
    )
  )
  assert.ok(
    zhHtml.includes(
      '<a class="site-announcement-comment__img-link" href="https://goprmpt.net/user-api/announcements/comment-images/img-200" target="_blank" rel="noopener noreferrer"><img class="site-announcement-comment__img" src="https://goprmpt.net/user-api/announcements/comment-images/img-200" loading="lazy" alt="评论图片" /></a>'
    )
  )
  // Image-only comment renders without an empty text <p>
  assert.equal((zhHtml.match(/class="site-announcement-comment__text"/g) || []).length, 2)
  assert.equal((zhHtml.match(/class="site-announcement-comment__img"/g) || []).length, 2)
  assert.equal(zhHtml.includes('evil.example'), false)
  assert.equal(zhHtml.includes('javascript:'), false)
  assert.equal(zhHtml.includes('mallory'), false)

  const enHtml = renderAnnouncementCommentsHtml(comments, 'en')
  assert.match(enHtml, /Comments \(3\)/)
  assert.ok(enHtml.includes('alt="Comment image"'))
})
