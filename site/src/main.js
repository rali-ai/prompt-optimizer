import './styles.css'
import { categories, prompts } from 'virtual:library/prompts'
import { lessons } from 'virtual:library/lessons'
import { OPTIMIZER_URL, initSiteChrome, renderSiteFooter, renderSiteHeader, siteBackground } from './shell.js'
import { escapeHtml } from './html.js'

const EXTENSION_VERSION = '2.16.0'
const EXTENSION_DOWNLOAD_FILENAME = `goprmpt-extension-${EXTENSION_VERSION}.zip`
const EXTENSION_DOWNLOAD_URL = `/downloads/${EXTENSION_DOWNLOAD_FILENAME}`
import {
  applyDocumentMeta,
  categoryCopy,
  contentLanguage,
  getInitialLocale,
  htmlLang,
  localeFocusRegion,
  restoreLocaleFocus,
  toggleLocale
} from './locale.js'

const categoryById = new Map(categories.map((c) => [c.id, c]))
const courseLessons = lessons.filter((l) => l.track === 'course')
const patternLessons = lessons.filter((l) => l.track === 'pattern')

const userPromptCount = prompts.filter((p) => p.target === 'basic-user').length
const systemPromptCount = prompts.filter((p) => p.target === 'basic-system').length
const imagePromptCount = prompts.filter((p) => p.target === 'image-text2image').length
const textCategoryCount = categories.filter((c) => c.kind === 'text').length
const imageCategoryCount = categories.filter((c) => c.kind === 'image').length

const HERO_SAMPLES = {
  'zh-CN': {
    weekly: {
      tab: '周报',
      before: '“帮我把本周做完的工作整理成一份给老板看的周报。”',
      after:
        '将下面的工作记录整理成一份给直属主管看的周报。\n按【本周核心结论】【关键产出】【风险与支持】【下周重点】四段输出，每条先写结果再写动作，未提及的数据标【待补充】，禁用空话套话。'
    },
    xhs: {
      tab: '小红书',
      before: '“写一篇小红书干货笔记，教新手怎么写好 AI 提示词。”',
      after:
        '写一篇面向职场新手的小红书干货教程，主题「写好 AI 提示词的 3 个诀窍」。\n给 3 个 20 字内备选标题；开头 2 句直击痛点；正文 3 个技巧各配 1 组「反例 vs 正例」；口语短句 450–600 字，不推销付费产品。'
    },
    code: {
      tab: '代码评审',
      before: '“帮我 review 一下这段代码有没有 bug。”',
      after:
        '以资深后端工程师视角审查下方代码变更，只报告真实风险，不做风格说教。\n按【高/中/低】列出：位置 + 触发条件 + 最小修复建议；重点查空值、并发、越权与 N+1 查询，上下文不足先提问不猜测。'
    },
    image: {
      tab: 'AI 绘图',
      before: '“画一张谷雨节气的中文海报，要有茶和水墨感。”',
      after:
        '现代新中式平面设计海报，主题「谷雨 · 采茶」，编辑级版式而非廉价网图。\n上半区 60% 宣纸留白配竖排宋体「谷雨」；下半区淡墨远山与青瓷茶杯；米白 70% / 青墨 20% / 茶绿 10%；避免多余英文乱码与水印。'
    }
  },
  en: {
    weekly: {
      tab: 'Weekly Report',
      before: '"Turn my notes from this week into a weekly report for my manager."',
      after:
        'Turn the work notes below into a concise weekly update for my direct manager.\nStructure into [Key Takeaway], [Shipped Outcomes], [Risks & Asks], and [Next Week]. Lead every bullet with the outcome, flag missing numbers as [TBD], and cut filler.'
    },
    xhs: {
      tab: 'Social Post',
      before: '"Write a short social post teaching beginners how to write better AI prompts."',
      after:
        'Write a practical guide for busy professionals: "3 habits for reliable AI prompts."\nInclude 3 title options under 60 chars, a 2-sentence hook, and 3 concrete tips each paired with a Before vs. After example. Conversational tone, no hype.'
    },
    code: {
      tab: 'Code Review',
      before: '"Review this code and tell me if there are any bugs."',
      after:
        'Act as a senior backend engineer reviewing the diff below. Report real defects only, no style nitpicks.\nGroup by High/Medium/Low severity with file/line, trigger condition, and minimal fix. Check nulls, concurrency, auth, and N+1 queries; ask instead of guessing.'
    },
    image: {
      tab: 'AI Visual',
      before: '"Create a spring tea poster in modern ink-wash style."',
      after:
        'Editorial graphic design poster for "Spring Rain · First Tea" — clean typography, never cluttered stock art.\n60% warm rice-paper negative space on top with slim serif title; soft ink mountains and celadon teacup below; 70% ivory / 20% ink / 10% tea green; no garbled text or watermarks.'
    }
  }
}

function pickPromptsForFilter(filterKey) {
  if (filterKey === 'all') {
    const preferred = [
      'weekly-report',
      'xiaohongshu-guide',
      'plain-language-explainer',
      'automation-task-writer',
      'chinese-typography-poster',
      'process-infographic'
    ]
    const picked = []
    for (const id of preferred) {
      const found = prompts.find((p) => p.id === id)
      if (found) picked.push(found)
    }
    const categorySpread = ['office', 'marketing', 'coding', 'poster', 'study', 'infographic']
    for (const catId of categorySpread) {
      if (picked.length >= 6) break
      const candidate = prompts.find((p) => p.category === catId && !picked.some((x) => x.id === p.id))
      if (candidate) picked.push(candidate)
    }
    for (const p of prompts) {
      if (picked.length >= 6) break
      if (!picked.some((x) => x.id === p.id)) picked.push(p)
    }
    return picked.slice(0, 6)
  }

  if (filterKey === 'image') {
    return prompts.filter((p) => p.target === 'image-text2image').slice(0, 6)
  }

  return prompts.filter((p) => p.category === filterKey).slice(0, 6)
}

const translations = {
  'zh-CN': {
    title: '高词 · GoPrmpt',
    description: '高词（GoPrmpt）：把模糊想法变成稳定好用的 AI 指令。全屏提示词优化工作台、151 条中英双语提示词库与 26 节系统教程。',
    badge: `${prompts.length} 条中英双语提示词 · ${lessons.length} 节系统教程 · 暖玉翡翠工作台`,
    heroTitleBefore: '把模糊的想法，变成',
    heroTitleHighlight: '稳定好用的 AI 指令',
    heroLead:
      '输入一句话需求，自动补全角色设定、边界约束与输出格式，在全屏工作台并排对比改写前后效果。配置与收藏默认保存在本地浏览器，不经过中间服务器。',
    ctaPrimary: '打开全屏工作台',
    ctaLibrary: `浏览 ${prompts.length} 条提示词库`,
    ctaLearn: `${lessons.length} 节系统教程`,
    setupNote: '免登录即可直接使用 · 首次优化只需填入自己的模型 API Key 或连接本地模型。注册会员可以用网站积分，不用填自己的模型。',
    demoLabel: '3 秒看懂优化效果',
    demoBeforeTag: '改写前（容易跑偏或写成流水账）',
    demoAfterTag: '改写后（已补全角色 · 骨架结构 · 防编造约束）',
    demoFootHint: '支持文本、多轮上下文与 AI 图像提示词',
    demoCta: '去工作台亲自试一试 →',
    metrics: [
      {
        value: String(prompts.length),
        label: '条中英双语提示词',
        sub: `用户 ${userPromptCount} · 系统 ${systemPromptCount} · 图像 ${imagePromptCount}`
      },
      {
        value: String(categories.length),
        label: '大高频业务分类',
        sub: `文本 ${textCategoryCount} 类 + 视觉绘图 ${imageCategoryCount} 类`
      },
      {
        value: String(lessons.length),
        label: '节系统课程与写法',
        sub: `${courseLessons.length} 节入门课 + ${patternLessons.length} 节进阶写法`
      },
      {
        value: '3 端',
        label: '全场景随时可用',
        sub: '网页工作台 · 浏览器插件 · 微信小程序'
      }
    ],
    workflowEyebrow: '工作流',
    workflowTitle: '四步把提示词打磨到稳定可用',
    workflowNote: '支持基础优化、多轮上下文、AI 图像与多模型竞技场对比',
    workflowSteps: [
      {
        step: 'STEP 01',
        title: '输入想法或导入词库',
        body: `随便写几句口语化需求，或直接从 ${prompts.length} 条双语提示词库里挑一条一键导入。`
      },
      {
        step: 'STEP 02',
        title: '一键结构化改写',
        body: '用你自选的大模型自动补全角色设定、边界约束、输出格式与防跑偏规则。'
      },
      {
        step: 'STEP 03',
        title: '并排对比与快捷迭代',
        body: '用同一个模型测试改写前后的真实输出，按需继续精简、补负面清单或抽离变量。'
      },
      {
        step: 'STEP 04',
        title: '多模型验证与沉淀复用',
        body: '在竞技场横向对比多模型回答，把验证好用的版本与示例存入本地收藏夹。'
      }
    ],
    libraryEyebrow: '精选提示词库',
    libraryTitle: `${prompts.length} 条中英双语提示词，填变量即可用`,
    libraryFilters: [
      { key: 'all', label: '全部精选' },
      { key: 'office', label: '职场办公' },
      { key: 'marketing', label: '营销文案' },
      { key: 'coding', label: '编程开发' },
      { key: 'image', label: 'AI 绘图' }
    ],
    cardMeta: '中英双语 · 支持变量',
    cardCta: '立即试用 →',
    libraryMoreCta: '查看全部提示词 →',
    academyEyebrow: '系统方法论学院',
    academyTitle: `${lessons.length} 节双语实战课：从入门四要素到高阶写法`,
    courseBadge: `入门课程 · ${courseLessons.length} 课`,
    courseSub: '含改写对比 + 课后练习',
    courseTitle: '系统打牢提示词基本功',
    courseCta: `查看全部 ${courseLessons.length} 节入门课 →`,
    patternBadge: `进阶写法 · ${patternLessons.length} 课`,
    patternSub: '真实高频避坑技巧',
    patternTitle: '压住模型惯性的工程化写法',
    patternCta: `查看全部 ${patternLessons.length} 节进阶写法 →`,
    extensionEyebrow: '浏览器插件 · Chrome / Edge',
    extensionTitle: '高词侧边栏插件：在任意 AI 对话页右侧随手改写提示词',
    extensionNote: `v${EXTENSION_VERSION} · MV3 原生侧边栏 · 支持云同步`,
    extensionLead:
      '打开 DeepSeek、ChatGPT、Claude、豆包或任意网页时，点一下工具栏图标就能在浏览器右侧滑出紧凑版高词工作台，不用来回切标签页，并支持与 goprmpt.net 网站双向云同步。',
    extensionDownloadCta: '下载浏览器插件 (.zip)',
    extensionMeta: `版本 v${EXTENSION_VERSION} · 约 1.7 MB · 适用 Chrome / Edge 114+`,
    extensionFeatures: [
      {
        title: '右侧边栏紧凑模式',
        body: '原生 Side Panel 贴合在当前网页右侧，左边对话右边调提示词；右键图标也可随时全屏打开。'
      },
      {
        title: '网页划词右键优化',
        body: '在任意网页选中一段文字，点右键即可直接带入右侧栏改写与结构化整理。'
      },
      {
        title: '与网站双向云同步',
        body: '登录同一个高词账号，收藏夹、历史记录、自定义模板与变量在插件和 goprmpt.net 间一键互通。'
      },
      {
        title: '本地优先 BYOK 安全',
        body: '免登录支持离线使用；模型 API Key 仅留在各自本机浏览器，绝不上传服务器。'
      }
    ],
    extensionInstallTitle: '30 秒本地安装指南',
    extensionInstallSub: '离线安装包，无需访问海外应用商店',
    extensionSteps: [
      {
        num: '01',
        title: '下载插件压缩包',
        body: `点击左侧按钮下载 ${EXTENSION_DOWNLOAD_FILENAME} 到本地电脑。`
      },
      {
        num: '02',
        title: '打开扩展管理并开启开发者模式',
        body: '在 Chrome 地址栏输入 chrome://extensions（Edge 输入 edge://extensions），打开右上角「开发者模式」。'
      },
      {
        num: '03',
        title: '直接拖入即可使用',
        body: '将下载好的 .zip 压缩包直接拖进扩展管理页面（或解压后点「加载已解压的扩展程序」），固定工具栏翡翠绿 G 图标即可。'
      }
    ],
    extensionSyncTip: '提示：打开右侧栏后点左上角「功能 → 登录 / 云同步」，即可与 goprmpt.net 网站同步你的收藏和模板。',
    platformTitle: '网页工作台 · 浏览器侧栏插件 · 全场景顺手可用',
    platformBody:
      '配置、历史和收藏默认保存在浏览器本地；相关输入直接发给你自行配置的模型服务，请勿在提示词中提交个人隐私或敏感机密信息。AI 生成内容仅供参考，请结合实际场景人工核验。',
    platformPrimary: '打开网页工作台',
    platformDownload: '下载浏览器插件',
    platformSecondary: '浏览提示词库',
    targets: {
      'basic-user': '用户',
      'basic-system': '系统',
      'image-text2image': '文生图'
    }
  },
  en: {
    title: 'GoPrmpt · 高词',
    description:
      'GoPrmpt: Turn rough ideas into reliable AI prompts. Full-screen prompt workbench, 151 bilingual prompts, and 26 hands-on lessons.',
    badge: `${prompts.length} Bilingual Prompts · ${lessons.length} Structured Lessons · Precision Workbench`,
    heroTitleBefore: 'Turn rough ideas into ',
    heroTitleHighlight: 'reliable AI prompts',
    heroLead:
      'Enter a one-line goal to automatically structure role, constraints, and output format, then compare real model responses side by side. Settings and favorites stay local in your browser.',
    ctaPrimary: 'Open Workbench',
    ctaLibrary: `Browse ${prompts.length} Prompts`,
    ctaLearn: `${lessons.length} Lessons`,
    setupNote: 'Ready to use without sign-up · Bring your own API key or connect a local model. Registered members can also use site credits without configuring their own model.',
    demoLabel: '3-Second Rewrite Preview',
    demoBeforeTag: 'Before (vague & prone to generic filler)',
    demoAfterTag: 'After (role · structure · anti-hallucination guardrails)',
    demoFootHint: 'Supports text, multi-turn context & AI image prompts',
    demoCta: 'Try it in the Workbench →',
    metrics: [
      {
        value: String(prompts.length),
        label: 'Bilingual Prompts',
        sub: `User ${userPromptCount} · System ${systemPromptCount} · Image ${imagePromptCount}`
      },
      {
        value: String(categories.length),
        label: 'Focused Categories',
        sub: `${textCategoryCount} text + ${imageCategoryCount} visual design`
      },
      {
        value: String(lessons.length),
        label: 'Courses & Patterns',
        sub: `${courseLessons.length} starter lessons + ${patternLessons.length} patterns`
      },
      {
        value: '3x',
        label: 'Multi-Surface Access',
        sub: 'Web Studio · Browser Extension · Mini-Program'
      }
    ],
    workflowEyebrow: 'Workflow',
    workflowTitle: 'Four steps from rough thought to reliable prompt',
    workflowNote: 'Text rewriting, multi-turn context, AI visuals & multi-model Arena',
    workflowSteps: [
      {
        step: 'STEP 01',
        title: 'Write or import a prompt',
        body: `Start with a casual sentence or import directly from our ${prompts.length} bilingual library templates.`
      },
      {
        step: 'STEP 02',
        title: 'One-click structured rewrite',
        body: 'Clarify role, task boundaries, output format, and negative rules using your chosen LLM.'
      },
      {
        step: 'STEP 03',
        title: 'Compare real outputs',
        body: 'Run both versions against the same model to verify the rewrite actually improves quality.'
      },
      {
        step: 'STEP 04',
        title: 'Benchmark & save favorites',
        body: 'Test side by side in Arena and save proven prompts with variables to your local library.'
      }
    ],
    libraryEyebrow: 'Featured Library',
    libraryTitle: `${prompts.length} bilingual prompts, ready with variables`,
    libraryFilters: [
      { key: 'all', label: 'Featured' },
      { key: 'office', label: 'Workplace' },
      { key: 'marketing', label: 'Marketing' },
      { key: 'coding', label: 'Coding' },
      { key: 'image', label: 'AI Image' }
    ],
    cardMeta: 'Bilingual · Variables',
    cardCta: 'Try now →',
    libraryMoreCta: 'Browse full library →',
    academyEyebrow: 'Prompting Academy',
    academyTitle: `${lessons.length} bilingual lessons: from fundamentals to engineering patterns`,
    courseBadge: `Starter Course · ${courseLessons.length} lessons`,
    courseSub: 'Before/After + Exercises',
    courseTitle: 'Build rock-solid prompting fundamentals',
    courseCta: `View all ${courseLessons.length} starter lessons →`,
    patternBadge: `Prompt Patterns · ${patternLessons.length} lessons`,
    patternSub: 'Battle-tested structures',
    patternTitle: 'Engineering patterns that tame model drift',
    patternCta: `View all ${patternLessons.length} patterns →`,
    extensionEyebrow: 'Browser Extension · Chrome / Edge',
    extensionTitle: 'GoPrmpt Side Panel: refine prompts right beside any AI chat',
    extensionNote: `v${EXTENSION_VERSION} · MV3 Side Panel · Cloud Sync`,
    extensionLead:
      'Click the toolbar icon on ChatGPT, Claude, DeepSeek, or any webpage to slide open a compact GoPrmpt studio on the right edge of your browser, with optional two-way sync to goprmpt.net.',
    extensionDownloadCta: 'Download Extension (.zip)',
    extensionMeta: `v${EXTENSION_VERSION} · ~1.7 MB · Chrome / Edge 114+`,
    extensionFeatures: [
      {
        title: 'Right-hand Side Panel',
        body: 'Native MV3 Side Panel keeps your chat on the left and prompt workbench on the right. Right-click the icon for full-tab view.'
      },
      {
        title: 'Right-click selection rewrite',
        body: 'Highlight any text on a webpage and send it straight into the right-hand studio for structured rewriting.'
      },
      {
        title: 'Two-way sync with goprmpt.net',
        body: 'Sign in with the same GoPrmpt account to sync favorites, history, templates, and variables across extension and web.'
      },
      {
        title: 'Local-first BYOK privacy',
        body: 'Works offline without sign-in. Model API keys stay strictly inside your local browser storage and are never uploaded.'
      }
    ],
    extensionInstallTitle: '30-Second Local Install',
    extensionInstallSub: 'Direct package download, no web store required',
    extensionSteps: [
      {
        num: '01',
        title: 'Download the ZIP package',
        body: `Click the download button to save ${EXTENSION_DOWNLOAD_FILENAME} to your computer.`
      },
      {
        num: '02',
        title: 'Open Extensions & Developer Mode',
        body: 'Visit chrome://extensions (or edge://extensions in Edge) and enable Developer mode in the top-right corner.'
      },
      {
        num: '03',
        title: 'Drag & drop to install',
        body: 'Drag the downloaded .zip straight onto the Extensions page (or unzip and click Load unpacked), then pin the jade G icon.'
      }
    ],
    extensionSyncTip: 'Tip: Open the Side Panel and click Functions → Sign in / Sync to sync your favorites and templates with goprmpt.net.',
    platformTitle: 'Web Workbench · Side Panel Extension · Built for Daily Flow',
    platformBody:
      'Settings, history, and favorites stay in your browser by default. Requests go directly to the model provider you configure; do not submit private or confidential data. AI-generated outputs are for reference only; please review before use.',
    platformPrimary: 'Open Web Workbench',
    platformDownload: 'Download Extension',
    platformSecondary: 'Explore Prompt Library',
    targets: {
      'basic-user': 'User',
      'basic-system': 'System',
      'image-text2image': 'Image'
    }
  }
}

let activeHeroKey = 'weekly'
let activeFilterKey = 'all'

function renderFeaturedCardsHtml(locale, filterKey) {
  const copy = translations[locale] ?? translations['zh-CN']
  const lang = contentLanguage(locale)
  const docLang = htmlLang(locale)
  const list = pickPromptsForFilter(filterKey)

  return list
    .map((prompt) => {
      const content = prompt.locales[lang] ?? prompt.locales.zh
      const cat = categoryCopy(categoryById.get(prompt.category), lang)
      const targetLabel = copy.targets[prompt.target] ?? ''
      const badge = targetLabel ? `${cat.name} · ${targetLabel}` : cat.name
      return `
        <article class="glass-card featured-card">
          <div class="featured-card__top">
            <span class="featured-card__badge">${escapeHtml(badge)}</span>
            <h3 lang="${docLang}">${escapeHtml(content.title)}</h3>
            <p lang="${docLang}">${escapeHtml(content.summary)}</p>
          </div>
          <div class="featured-card__foot">
            <span class="featured-card__meta">${copy.cardMeta}</span>
            <a class="text-link" href="/library/?id=${encodeURIComponent(prompt.id)}">${copy.cardCta}</a>
          </div>
        </article>
      `
    })
    .join('')
}

function renderAcademyPreviewList(list, locale) {
  const lang = contentLanguage(locale)
  const docLang = htmlLang(locale)
  const indices = [0, 3, 6, Math.min(11, list.length - 1)].filter((i, idx, arr) => i >= 0 && i < list.length && arr.indexOf(i) === idx)
  return indices
    .map((i) => {
      const lesson = list[i]
      const content = lesson.locales[lang] ?? lesson.locales.zh
      const hasPrefix = /^(第\s*\d+\s*课|写法\s*\d+|Lesson\s*\d+|Pattern\s*\d+)/i.test(content.title)
      const prefix = hasPrefix ? '· ' : (locale === 'en' ? `${i + 1}. ` : `· 第 ${i + 1} 课：`)
      return `
        <li>
          <a href="/learn/?id=${encodeURIComponent(lesson.id)}" lang="${docLang}">${escapeHtml(prefix + content.title)}</a>
        </li>
      `
    })
    .join('')
}

function renderApp(locale, { preserveFocus = false } = {}) {
  const copy = translations[locale] ?? translations['zh-CN']
  const samples = HERO_SAMPLES[locale] ?? HERO_SAMPLES['zh-CN']
  const currentSample = samples[activeHeroKey] ?? samples.weekly
  const menuExpanded = document.querySelector('.site-menu-button')?.getAttribute('aria-expanded') ?? 'false'
  const focusedRegion = preserveFocus ? localeFocusRegion() : null

  applyDocumentMeta({ locale, title: copy.title, description: copy.description })

  document.querySelector('#app').innerHTML = `
    <div class="site-shell">
      ${siteBackground}
      ${renderSiteHeader({ locale, current: '/', showLocale: true, menuExpanded })}

      <main>
        <!-- 1. Widescreen Split Hero + 3-Second Switcher -->
        <section class="home-hero">
          <div class="home-hero__copy">
            <div class="home-badge">
              <span class="home-badge__dot" aria-hidden="true"></span>
              <span>${escapeHtml(copy.badge)}</span>
            </div>
            <h1 class="home-hero__title">
              ${escapeHtml(copy.heroTitleBefore)}<span class="gradient-text">${escapeHtml(copy.heroTitleHighlight)}</span>
            </h1>
            <p class="home-hero__lead">${escapeHtml(copy.heroLead)}</p>
            <div class="home-hero__actions">
              <a class="button button--primary" href="${OPTIMIZER_URL}" target="_blank" rel="noopener noreferrer">${escapeHtml(copy.ctaPrimary)}</a>
              <a class="button" href="/library/">${escapeHtml(copy.ctaLibrary)}</a>
              <a class="button" href="/learn/">${escapeHtml(copy.ctaLearn)}</a>
            </div>
            <p class="home-hero__note">${escapeHtml(copy.setupNote)}</p>
          </div>

          <div class="glass-card hero-demo" aria-live="polite">
            <div class="hero-demo__head">
              <span class="hero-demo__label">${escapeHtml(copy.demoLabel)}</span>
              <div class="hero-demo__tabs" role="group" aria-label="${escapeHtml(copy.demoLabel)}">
                ${Object.entries(samples)
                  .map(
                    ([key, item]) => `
                      <button
                        type="button"
                        class="demo-tab"
                        data-hero-sample="${key}"
                        aria-pressed="${key === activeHeroKey ? 'true' : 'false'}"
                      >${escapeHtml(item.tab)}</button>
                    `
                  )
                  .join('')}
              </div>
            </div>

            <div class="hero-demo__box hero-demo__box--before">
              <span class="hero-demo__tag">${escapeHtml(copy.demoBeforeTag)}</span>
              <p class="hero-demo__text" id="hero-demo-before">${escapeHtml(currentSample.before)}</p>
            </div>

            <div class="hero-demo__box hero-demo__box--after">
              <span class="hero-demo__tag">${escapeHtml(copy.demoAfterTag)}</span>
              <p class="hero-demo__text" id="hero-demo-after">${escapeHtml(currentSample.after)}</p>
            </div>

            <div class="hero-demo__foot">
              <span class="hero-demo__foot-hint">${escapeHtml(copy.demoFootHint)}</span>
              <a class="text-link" href="${OPTIMIZER_URL}" target="_blank" rel="noopener noreferrer">${escapeHtml(copy.demoCta)}</a>
            </div>
          </div>
        </section>

        <!-- 2. Live Data Metrics Strip -->
        <section class="metrics-grid" aria-label="Platform metrics">
          ${copy.metrics
            .map(
              (m) => `
                <div class="glass-card metric-card">
                  <span class="metric-card__value">${escapeHtml(m.value)}</span>
                  <span class="metric-card__label">${escapeHtml(m.label)}</span>
                  <span class="metric-card__sub">${escapeHtml(m.sub)}</span>
                </div>
              `
            )
            .join('')}
        </section>

        <!-- 3. 4-Step Workflow -->
        <section class="section--plain" id="workflow">
          <div class="section-head">
            <div>
              <div class="section-eyebrow">${escapeHtml(copy.workflowEyebrow)}</div>
              <h2>${escapeHtml(copy.workflowTitle)}</h2>
            </div>
            <span class="section-note">${escapeHtml(copy.workflowNote)}</span>
          </div>
          <div class="workflow-grid">
            ${copy.workflowSteps
              .map(
                (item) => `
                  <article class="glass-card workflow-card">
                    <span class="workflow-card__step">${escapeHtml(item.step)}</span>
                    <h3>${escapeHtml(item.title)}</h3>
                    <p>${escapeHtml(item.body)}</p>
                  </article>
                `
              )
              .join('')}
          </div>
        </section>

        <!-- 4. Interactive Filterable Featured Prompt Cards -->
        <section class="section--plain" id="featured-library">
          <div class="section-head">
            <div>
              <div class="section-eyebrow">${escapeHtml(copy.libraryEyebrow)}</div>
              <h2>${escapeHtml(copy.libraryTitle)}</h2>
            </div>
            <div class="filter-tabs" role="group" aria-label="${escapeHtml(copy.libraryEyebrow)}">
              ${copy.libraryFilters
                .map(
                  (f) => `
                    <button
                      type="button"
                      class="demo-tab"
                      data-library-filter="${f.key}"
                      aria-pressed="${f.key === activeFilterKey ? 'true' : 'false'}"
                    >${escapeHtml(f.label)}</button>
                  `
                )
                .join('')}
              <a class="text-link" href="/library/" style="margin-left: 6px;">${escapeHtml(copy.libraryMoreCta)}</a>
            </div>
          </div>
          <div class="featured-grid" id="home-featured-grid">
            ${renderFeaturedCardsHtml(locale, activeFilterKey)}
          </div>
        </section>

        <!-- 5. 26-Lesson Academy Dual-Track Preview -->
        <section class="section--plain" id="academy">
          <div class="section-head">
            <div>
              <div class="section-eyebrow">${escapeHtml(copy.academyEyebrow)}</div>
              <h2>${escapeHtml(copy.academyTitle)}</h2>
            </div>
          </div>
          <div class="academy-grid">
            <article class="glass-card academy-card">
              <div class="academy-card__head">
                <span class="academy-pill">${escapeHtml(copy.courseBadge)}</span>
                <span class="academy-card__sub">${escapeHtml(copy.courseSub)}</span>
              </div>
              <h3>${escapeHtml(copy.courseTitle)}</h3>
              <ul class="academy-list">
                ${renderAcademyPreviewList(courseLessons, locale)}
              </ul>
              <a class="button academy-card__cta" href="/learn/">${escapeHtml(copy.courseCta)}</a>
            </article>

            <article class="glass-card academy-card">
              <div class="academy-card__head">
                <span class="academy-pill academy-pill--indigo">${escapeHtml(copy.patternBadge)}</span>
                <span class="academy-card__sub">${escapeHtml(copy.patternSub)}</span>
              </div>
              <h3>${escapeHtml(copy.patternTitle)}</h3>
              <ul class="academy-list">
                ${renderAcademyPreviewList(patternLessons, locale)}
              </ul>
              <a class="button academy-card__cta" href="/learn/?track=pattern">${escapeHtml(copy.patternCta)}</a>
            </article>
          </div>
        </section>

        <!-- 6. Browser Extension Showcase & Direct Download -->
        <section class="section--plain" id="extension">
          <div class="section-head">
            <div>
              <div class="section-eyebrow">${escapeHtml(copy.extensionEyebrow)}</div>
              <h2>${escapeHtml(copy.extensionTitle)}</h2>
            </div>
            <span class="section-note">${escapeHtml(copy.extensionNote)}</span>
          </div>

          <div class="extension-grid">
            <article class="glass-card extension-main">
              <p class="extension-main__lead">${escapeHtml(copy.extensionLead)}</p>
              <div class="extension-features">
                ${copy.extensionFeatures
                  .map(
                    (feat) => `
                      <div class="extension-feature">
                        <h3>${escapeHtml(feat.title)}</h3>
                        <p>${escapeHtml(feat.body)}</p>
                      </div>
                    `
                  )
                  .join('')}
              </div>
              <div class="extension-download-row">
                <a
                  class="button button--primary"
                  href="${EXTENSION_DOWNLOAD_URL}"
                  download="${EXTENSION_DOWNLOAD_FILENAME}"
                  data-testid="extension-download-link"
                >${escapeHtml(copy.extensionDownloadCta)}</a>
                <span class="extension-download-meta">${escapeHtml(copy.extensionMeta)}</span>
              </div>
            </article>

            <aside class="glass-card extension-install">
              <div class="extension-install__head">
                <h3>${escapeHtml(copy.extensionInstallTitle)}</h3>
                <span>${escapeHtml(copy.extensionInstallSub)}</span>
              </div>
              <ol class="extension-steps">
                ${copy.extensionSteps
                  .map(
                    (step) => `
                      <li class="extension-step">
                        <span class="extension-step__num">${escapeHtml(step.num)}</span>
                        <div>
                          <strong>${escapeHtml(step.title)}</strong>
                          <p>${escapeHtml(step.body)}</p>
                        </div>
                      </li>
                    `
                  )
                  .join('')}
              </ol>
              <p class="extension-install__tip">${escapeHtml(copy.extensionSyncTip)}</p>
            </aside>
          </div>
        </section>

        <!-- 7. Multi-Platform & Privacy/Compliance Banner -->
        <section class="section--plain" id="platforms">
          <div class="glass-card platform-banner">
            <div class="platform-banner__copy">
              <h3>${escapeHtml(copy.platformTitle)}</h3>
              <p>${escapeHtml(copy.platformBody)}</p>
            </div>
            <div class="platform-banner__actions">
              <a class="button button--primary" href="${OPTIMIZER_URL}" target="_blank" rel="noopener noreferrer">${escapeHtml(copy.platformPrimary)}</a>
              <a class="button" href="${EXTENSION_DOWNLOAD_URL}" download="${EXTENSION_DOWNLOAD_FILENAME}">${escapeHtml(copy.platformDownload)}</a>
              <a class="button" href="/library/">${escapeHtml(copy.platformSecondary)}</a>
            </div>
          </div>
        </section>
      </main>

      ${renderSiteFooter({ locale, current: '/', showLocale: true })}
    </div>
  `

  bindHomeInteractions(locale)
  restoreLocaleFocus(focusedRegion)
}

function bindHomeInteractions(locale) {
  const samples = HERO_SAMPLES[locale] ?? HERO_SAMPLES['zh-CN']

  document.querySelectorAll('[data-hero-sample]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-hero-sample')
      if (!samples[key]) return
      activeHeroKey = key
      document.querySelectorAll('[data-hero-sample]').forEach((el) => {
        el.setAttribute('aria-pressed', el === btn ? 'true' : 'false')
      })
      const beforeEl = document.getElementById('hero-demo-before')
      const afterEl = document.getElementById('hero-demo-after')
      if (beforeEl) beforeEl.textContent = samples[key].before
      if (afterEl) afterEl.textContent = samples[key].after
    })
  })

  document.querySelectorAll('[data-library-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-library-filter')
      activeFilterKey = key
      document.querySelectorAll('[data-library-filter]').forEach((el) => {
        el.setAttribute('aria-pressed', el === btn ? 'true' : 'false')
      })
      const grid = document.getElementById('home-featured-grid')
      if (grid) grid.innerHTML = renderFeaturedCardsHtml(locale, key)
    })
  })
}

let currentLocale = getInitialLocale()

initSiteChrome({
  onLocaleToggle: () => {
    currentLocale = toggleLocale(currentLocale)
    renderApp(currentLocale, { preserveFocus: true })
  }
})

renderApp(currentLocale)
