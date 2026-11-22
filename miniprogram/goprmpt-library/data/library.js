// 由 scripts/build-miniprogram-data.mjs 从 library/*.json 生成，请勿手改。
// 改数据后运行：pnpm miniprogram:data
module.exports = {
  "categories": [
    {
      "id": "writing",
      "name": "写作创作",
      "description": "文章、文案、故事"
    }
  ],
  "prompts": [
    {
      "id": "weekly-report",
      "title": "周报生成器",
      "summary": "把零散的工作记录整理成结构清晰的周报。",
      "prompt": "你是一名擅长归纳的职场写作助手。请把下面的工作记录整理成周报，分为“本周完成”“进行中”“下周计划”“需要协助”四部分，每条一句话，数据保留原样，不要编造。\n\n本周工作记录：\n{{记录}}",
      "variables": [
        {
          "name": "记录",
          "description": "本周做过的事，一行一条",
          "defaultValue": ""
        }
      ],
      "category": "writing",
      "tags": [
        "职场",
        "总结"
      ],
      "target": "basic-user",
      "example": "",
      "credit": "",
      "en": null
    }
  ],
  "learn": []
}
