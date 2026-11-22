# 提示词库数据

网站（goprmpt.com）、优化器（goprmpt.net）、浏览器插件和微信小程序共用这一份数据。只改这里，再运行生成脚本，不要在各端手改副本。

## 文件

- `categories.json`：分类列表。
- `prompts.json`：提示词列表。
- `learn.json`：学习教程（方法论章节）。

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
- `en` 必填，是英文版的 `title`、`summary`、`prompt`、`variables`，规则同上；变量名用英文，变量个数要和中文版一致。`tags`、`category`、`target`、`example`、`source` 两种语言共用。
- `source` 可选，改编自外部提示词库时填写：`name` 来源名称，`url` 原文链接（http 或 https），`license` 可选，许可证。网站详情页底部展示为带链接的署名，小程序展示为一行文字。

## learn.json

```json
[{
  "id": "clear-goal",
  "title": "第 1 课：先说清目标",
  "summary": "一句话说明这课讲什么。",
  "sections": [{ "heading": "为什么", "body": "Markdown 段落" }],
  "before": "改写前的提示词",
  "after": "改写后的提示词",
  "exercise": "练习题"
}]
```
