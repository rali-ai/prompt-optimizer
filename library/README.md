# 提示词库数据

网站（goprmpt.com）、优化器（goprmpt.net）、浏览器插件和微信小程序共用这一份数据。只改这里，再运行生成脚本，不要在各端手改副本。

## 文件

- `categories.json`：分类列表。
- `prompts.json`：提示词列表。
- `learn.json`：学习教程（方法论章节）。
- `schema.mjs`：各端读取数据的唯一入口。`loadLibrary(dir)` 按本文的规则解析三个文件，有问题时一次列出全部问题。

改完运行 `node scripts/validate-library.mjs`：结构问题和套话会让它失败，还没有提示词的分类只给提示。再运行 `pnpm miniprogram:data` 重新生成小程序数据。

## categories.json

```json
[{
  "id": "writing",
  "name": "写作创作",
  "description": "文章、文案、故事",
  "kind": "text",
  "en": { "name": "Writing", "description": "Articles, copy and stories." }
}]
```

- `kind` 可选，`text`（文字）或 `image`（图片）。填了以后，分类下提示词的 `target` 必须同类：`text` 分类只放 `basic-user`、`basic-system`，`image` 分类只放 `image-text2image`。
- `en` 可选，英文版的 `name` 和 `description`，两项都要填；网站和小程序切到英文时显示。英文名不能重复。

## prompts.json

```json
[{
  "id": "weekly-report",
  "title": "周报生成器",
  "category": "writing",
  "tags": ["职场", "总结"],
  "summary": "把零散的工作记录整理成结构清晰的周报。",
  "target": "basic-user",
  "prompt": "你是……\n\n本周工作记录：{{记录}}",
  "variables": [{ "name": "记录", "description": "本周做过的事，一行一条", "defaultValue": "" }],
  "example": "可选：一段示例输入或输出说明",
  "source": { "name": "Prompt Garden", "url": "https://example.com/prompts/weekly-report", "license": "CC BY 4.0" },
  "en": {
    "title": "Weekly Report Generator",
    "summary": "Turn scattered work notes into a clearly structured weekly report.",
    "prompt": "You are ...\n\nThis week's work notes:\n{{notes}}",
    "variables": [{ "name": "notes", "description": "What you did this week, one item per line", "defaultValue": "" }]
  }
}]
```

- `id` 只用小写字母、数字和连字符，同时充当优化器的导入码。英文版的导入码是 `<id>-en`，所以不要另起一个以 `-en` 结尾、和已有 id 撞车的 id。
- `target` 为 `basic-user`（用户提示词）、`basic-system`（系统提示词）或 `image-text2image`（AI 绘图提示词），决定导入优化器的哪个工作区。
- `prompt` 里的变量写成 `{{变量名}}`，每个变量都要在 `variables` 里列出，列出的变量也都要在 `prompt` 里用到。
- `tags` 2 到 4 个，不能为空或重复。`summary` 是一句话，以句末标点结尾。中文标题、英文标题各自不能重复。
- `en` 必填，是英文版的 `title`、`summary`、`prompt`、`variables`，规则同上；变量名用英文 snake_case，变量个数要和中文版一致。`tags`、`category`、`target`、`example`、`source` 两种语言共用。
- `source` 可选，改编自外部提示词库时填写：`name` 来源名称，`url` 原文链接（http 或 https），`license` 可选，许可证。网站详情页底部展示为带链接的署名，小程序展示为一行文字。

## learn.json

```json
[{
  "id": "clear-goal",
  "track": "course",
  "order": 1,
  "title": "第 1 课：先说清目标",
  "summary": "一句话说明这课讲什么。",
  "sections": [{ "heading": "为什么", "body": "Markdown 段落" }],
  "before": "改写前的提示词",
  "after": "改写后的提示词",
  "exercise": "练习题",
  "source": { "name": "Prompt Garden", "url": "https://example.com/patterns/clear-goal", "license": "CC BY 4.0" },
  "en": {
    "title": "Lesson 1: State the goal first",
    "summary": "One sentence on what this lesson covers.",
    "sections": [{ "heading": "Why", "body": "Markdown paragraph" }],
    "before": "Prompt before the rewrite",
    "after": "Prompt after the rewrite",
    "exercise": "Exercise"
  }
}]
```

- `track` 必填：`course` 是完整课程里的一课，`pattern` 是从某个提示词库提炼出的写法套路。
- `order` 可选，数字。有 `order` 的课按从小到大排在前面，没有的按文件顺序排在后面。
- `title`、`summary`、`before`、`after`、`exercise` 都必填且不能为空，`before` 和 `after` 不能相同；`sections` 至少一节，每节都要有 `heading` 和 `body`。
- `en` 必填，是英文版的 `title`、`summary`、`sections`、`before`、`after`、`exercise`，规则同上。中英文标题各自不能重复。
- `source` 可选，格式同提示词的 `source`，从外部提示词库提炼时填写。
