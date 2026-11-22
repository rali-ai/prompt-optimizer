# goprmpt 简版接入说明（给宿主小程序开发者）

goprmpt 简版是一个提示词优化器，整个功能在 `goprmpt-lite/` 这一个目录里：优化页、历史页、设置页（界面语言），外加 20 条日常写作示例。它不依赖宿主的 `app.js`、`getApp()`、`app.wxss`、全局组件或全局变量，本地存储键都以 `goprmpt_` 开头。界面跟随微信语言显示中文或英文，也可以在设置页手动切换。

## 接入步骤

1. 把 `goprmpt-lite/` 整个目录复制到宿主项目里，和 `app.json` 放在同一级。目录名不要改，页面路径里写死了 `goprmpt-lite`。
2. 在宿主 `app.json` 的 `subPackages` 里加这一项：

   ```json
   { "root": "goprmpt-lite", "pages": ["pages/optimize/optimize", "pages/history/history", "pages/settings/settings"] }
   ```

3. 在宿主任意页面放一个入口：

   ```js
   wx.navigateTo({ url: '/goprmpt-lite/pages/optimize/optimize' })
   ```

   想带着文字打开时，在 `success` 回调里发 `prefill` 事件，字段都可省略：

   ```js
   wx.navigateTo({
     url: '/goprmpt-lite/pages/optimize/optimize',
     success: (res) => res.eventChannel.emit('prefill', { input: '要优化的文字', mode: 'general', lang: 'zh' })
   })
   ```

   `mode` 可选 `general`、`structured`、`concise`、`system`、`image`，`lang` 可选 `zh`、`en`。

4. 改 `goprmpt-lite/config.js` 里的 `API_BASE`，指向你部署的 mp-server（见下一节）。
5. 在小程序后台“开发管理 → 开发设置 → 服务器域名”里，把 `API_BASE` 的域名加进 **request 合法域名**。不加的话正式版请求会失败，页面上会提示域名不在合法域名里。
6. 基础库要求 2.20.1 及以上（用到 `wx.getAppBaseInfo`）。

## 为什么要自己部署 mp-server

简版不直连大模型，只请求 mp-server。mp-server 负责用 `wx.login` 的 code 换用户身份、调用模型、做内容安全检查和限流。这几件事都绑定在**宿主小程序自己的 AppID** 上：

- `wx.login` 拿到的 code 只能用宿主的 AppID 和 AppSecret 换 openid。
- 微信内容安全接口 `msgSecCheck` 要用宿主 AppID 的 access_token，并带上这个用户在宿主下的 openid。

所以宿主需要用自己的 AppID、AppSecret 和模型 Key 部署一份 mp-server。它没有任何依赖，一个 Docker 镜像就能跑，部署方法见仓库里的 `packages/mp-server/README.zh-CN.md`。mp-server 的地址必须是 https，域名必须完成 ICP 备案。

## 资质和责任

简版运行在宿主小程序里，对微信和监管部门来说，提供 AI 生成内容服务的是**宿主小程序的主体**，相关资质和责任都落在宿主主体上：

- 宿主要在小程序后台为自己的主体申请 AI 相关的服务类目（例如“深度合成-AI 问答”），按微信要求提交材料。
- mp-server 调用的模型必须是已完成**生成式人工智能服务备案（算法备案）**的国内模型，比如 DeepSeek、通义千问、豆包。申请类目时一般要附上模型厂商的备案信息和你与厂商的合作协议或服务协议。
- 页面上 AI 生成的结果旁都标了“内容由 AI 生成”，这是审核要求，请不要去掉。
- 输入和输出都会经过微信内容安全检查，检查不通过或检查接口不可用时不会展示结果。

## 本地联调

1. 启动本地 mp-server：`cd packages/mp-server && MP_DEV=1 LLM_FAKE=1 npm start`（不需要任何密钥）。
2. 把 `config.js` 的 `API_BASE` 临时改成 `http://localhost:8787`。
3. 在微信开发者工具“详情 → 本地设置”勾选“不校验合法域名”。

## 更新

我们发布新版本后，用新的 `goprmpt-lite/` 目录整体替换旧目录（保留你改过的 `config.js`），重新上传发版即可。用户的历史记录存在本机，不受影响。
