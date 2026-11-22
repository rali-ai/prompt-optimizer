# user-sync-api

`goprmpt.net` 的零依赖可选用户账号、跨设备云同步（BYOK 安全隔离）与预埋会员管理后端服务。

## 设计原则

- **匿名免费可用**：不强制登录，访客打开即可使用全部核心功能。
- **零第三方 npm 依赖**：仅使用 Node.js 24 内置模块（`node:sqlite`、`node:crypto`、`node:http`、`node:fs`、`node:path`），不污染根 `pnpm-lock.yaml`。
- **BYOK 安全红线**：`PUT /user-api/sync` 仅允许 `favorites`、`history`、`templates`、`variables`、`preferences` 五个非敏感分区，并递归剔除任意层级的 `models`、`imageModels`、`apiKey`、`api_key`、`secretKey` 等字段，确保用户第三方大模型 API Key 永远留在浏览器本地。
- **预埋会员能力**：数据库包含 `tier`、`tier_expires_at` 与 `redemption_codes` 表，默认 `MEMBERSHIP_ENABLED=false`（全部功能免费开放）。

## 环境变量

详见 `.env.example`：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `USER_SYNC_HOST` | `127.0.0.1` | 监听地址 |
| `USER_SYNC_PORT` | `3002` | 监听端口 |
| `USER_SYNC_DB_PATH` | `/data/user-sync/users.db` | SQLite 路径（自动创建目录，WAL 模式） |
| `USER_SYNC_SECRET` | 自动生成 | 会话签名密钥；未设置时自动持久化到同目录 `.secret` |
| `MEMBERSHIP_ENABLED` | `false` | 会员开关，默认关闭 |
| `COOKIE_SECURE` | `0` | 强制 Cookie 带 `Secure`（反代 `X-Forwarded-Proto: https` 也会自动开启） |
| `ADMIN_USERNAME` | 空 | 可选：首次启动自动创建的管理员用户名 |
| `ADMIN_PASSWORD` | 空 | 可选：首次启动管理员密码（>= 8 位） |

## 接口列表（`/user-api/`）

- `GET /user-api/healthz`：健康检查
- `GET /user-api/config`：返回 `{ membershipEnabled, registrationEnabled }`
- `POST /user-api/register`：注册并写入 `HttpOnly` 会话 Cookie
- `POST /user-api/login`：登录并写入会话 Cookie（停用账号返回 403）
- `POST /user-api/logout`：退出并清除会话 Cookie
- `GET /user-api/me`：查询当前登录用户
- `GET /user-api/sync`：拉取云端同步数据
- `PUT /user-api/sync`：上传同步数据（支持 `expectedVersion` 乐观锁与 BYOK 严格脱敏）
- `GET /user-api/admin`：轻量中文管理后台页面
- `GET /user-api/admin/users`：管理员查询用户与同步占用列表
- `PATCH /user-api/admin/users/:id`：管理员调整用户 `tier`、`tierExpiresAt`、`disabled`

## 本地运行与测试

```bash
node --test packages/user-sync-api/test/*.test.js
USER_SYNC_DB_PATH=./tmp/users.db node packages/user-sync-api/src/main.js
```
