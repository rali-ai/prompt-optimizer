# mp-server：goprmpt 小程序后端

小程序不能直连大模型：`wx.request` 只能访问后台登记过、有 ICP 备案的域名，“深度合成-AI 问答”类目还要求运营者调用有算法备案的模型。所以小程序只请求本服务，由它完成登录、内容安全检查、调用模型和限流。模型 Key 和 AppSecret 只在服务端。

没有任何 npm 依赖，只用 Node 内置的 `node:http`、`fetch` 和 `node:crypto`，需要 Node 22 及以上。

## 本地运行

```bash
cd packages/mp-server
MP_DEV=1 LLM_FAKE=1 npm start     # 不需要任何密钥
npm test                          # 行为测试
```

Windows PowerShell 写法：`$env:MP_DEV='1'; $env:LLM_FAKE='1'; npm start`。

- `MP_DEV=1` 跳过微信接口：任何 `code` 都能登录，内容安全检查只拦含 `【违规示例】` 的文本。
- `LLM_FAKE=1` 不调用模型，返回 `【模拟优化结果】` 开头的固定格式文本。

微信开发者工具里联调时，把 `miniprogram/goprmpt-lite/config.js` 的 `API_BASE` 改成 `http://localhost:8787`，并在“详情 → 本地设置”勾选“不校验合法域名”。

## 部署

1. 复制 `.env.example` 为 `.env`，填 `MP_APPID`、`MP_SECRET`、`SESSION_SECRET` 和 `LLM_*`。缺任何一项都会拒绝启动。
2. 构建并运行：

   ```bash
   docker build -t goprmpt-mp-server packages/mp-server
   docker run -d --restart=always --env-file packages/mp-server/.env -p 127.0.0.1:8787:8787 goprmpt-mp-server
   ```

3. 用 Nginx 在备案域名上做 HTTPS 反向代理到 `127.0.0.1:8787`，并在小程序后台把这个域名加进“request 合法域名”。
4. 限流和额度存在进程内存里，只适合单实例。要多实例时换成 Redis。重启会清零当天额度。

## 接口

所有响应都是 JSON。出错时 HTTP 状态非 2xx，响应体是 `{ "error": { "code": "...", "message": "中文说明" } }`，小程序按 `code` 分支，`message` 可以直接展示。

### `POST /api/mp/login`

请求 `{ "code": "wx.login 拿到的 code" }`，响应 `{ "token": "v1.…", "expiresAt": 1764000000000 }`。

服务端调用 `jscode2session` 换 openid，再把 `{ sub, oid, exp }` 用 AES-256-GCM 封进令牌，密钥由 `SESSION_SECRET` 派生。`sub` 是 openid 的 HMAC，用作限流键。`oid` 是 openid 本身，因为内容安全检查 `msgSecCheck` v2 必须带 openid。令牌对小程序端不透明，读不出 openid，改动任何字节都会验证失败。响应里从不出现 openid 和 session_key。

### `POST /api/mp/optimize`

请求头 `Authorization: Bearer <token>`，请求体：

| 字段 | 说明 |
| --- | --- |
| `mode` | `general` 通用、`structured` 结构化、`concise` 精简、`system` 系统提示词、`image` 图片提示词、`iterate` 再优化 |
| `prompt` | 要优化的提示词；`iterate` 时是上一版结果 |
| `lang` | 输出语言 `zh` 或 `en`，默认 `zh` |
| `instruction` | 仅 `iterate` 用，改进方向，可空 |

响应 `{ "result": "优化后的提示词", "remaining": 49 }`，`remaining` 是今天剩余次数。

处理顺序：验令牌 → 校验参数和长度 → 限流和额度 → 输入过 `msgSecCheck` → 调模型 → 输出过 `msgSecCheck` → 返回。检查结果为 `risky` 时拒绝；检查接口本身出错时也拒绝（返回 `check_unavailable`），不放行。失败的请求不扣当天额度。

### `GET /healthz`

响应 `{ "ok": true }`。

## 错误码

| code | HTTP | 含义 |
| --- | --- | --- |
| `bad_json` / `bad_request` | 400 | 请求体不是 JSON，或参数不对 |
| `input_too_long` | 400 | 超过 `MAX_INPUT_CHARS` |
| `too_large` | 413 | 请求体超过 `MAX_BODY_BYTES` |
| `login_failed` | 401 | 微信不认这个 code |
| `unauthorized` | 401 | 令牌缺失、无效或过期，小程序应重新登录 |
| `rate_limited` | 429 | 超过每分钟次数 |
| `quota_exceeded` | 429 | 超过每日额度 |
| `input_risky` / `output_risky` | 422 | 输入或生成内容没通过内容安全检查 |
| `check_unavailable` | 503 | 内容安全接口不可用 |
| `llm_timeout` / `llm_failed` | 504 / 502 | 模型超时或出错 |

## 代码结构

| 文件 | 作用 |
| --- | --- |
| `src/main.js` | 读环境变量，选真实或模拟依赖，监听端口 |
| `src/config.js` | 环境变量 → 配置，缺项直接报错 |
| `src/app.js` | 路由、请求体读取、参数校验、错误码 |
| `src/token.js` | 会话令牌的签发和验证 |
| `src/wechat.js` | `jscode2session`、`stable_token`（缓存到过期前 5 分钟）、`msgSecCheck` v2 |
| `src/llm.js` | OpenAI 兼容的 chat completions |
| `src/limits.js` | 每分钟限流和每日额度 |
| `src/templates.js` | 各优化方式的元提示词，从 `packages/core` 的内置模板移植，只在服务端 |
