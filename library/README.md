# 提示词库数据

网站（goprmpt.com）、优化器（goprmpt.net）、浏览器插件和微信小程序共用这一份数据。只改这里，再运行生成脚本，不要在各端手改副本。

## 文件

- `categories.json`：分类列表。
- `prompts.json`：提示词列表。
- `learn.json`：学习教程（方法论章节）。

## categories.json

```json
[{ "id": "writing", "name": "写作创作", "description": "文章、文案、故事" }]
```

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
  "example": "可选：一段示例输入或输出说明"
}]
```

- `id` 只用小写字母、数字和连字符，同时充当优化器的导入码。
- `target` 为 `basic-user`（用户提示词）或 `basic-system`（系统提示词），决定导入优化器的哪个工作区。
- `prompt` 里的变量写成 `{{变量名}}`，每个变量都要在 `variables` 里列出。

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
