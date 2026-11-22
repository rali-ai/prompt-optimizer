# goprmpt.com 静态官网与公开接口部署说明

`site/` 是 `goprmpt.com` 的独立静态站点工程，包含首页（`/`）、双语提示词库（`/library/`）、双语教程页（`/learn/`），以及给优化器（`https://goprmpt.net`）读取的静态 JSON 接口（`/api/public/`）。

## 构建与本地校验

在仓库根目录执行：

```bash
cd site
corepack pnpm --config.engine-strict=false build
corepack pnpm --config.engine-strict=false verify
```

构建产物位于 `site/dist/`，其中：

- `site/dist/index.html`、`site/dist/library/index.html`、`site/dist/learn/index.html`：静态页面。
- `site/dist/api/public/prompt-source/<importCode>`：每条提示词中英文各一个无后缀 JSON 文件（供 `goprmpt.net` 按导入码拉取）。
- `site/dist/api/public/prompts/catalog/<zh|en>/<mode>.json`：8 个工作区的中英文目录文件（供 `goprmpt.net` 灵感弹窗和竞技场读取）。

## OpenResty 配置示例

将 `site/dist/` 同步到服务器静态目录（例如 `/var/www/goprmpt.com/dist`），在 OpenResty 的 `server` 块中配置如下规则：

```nginx
server {
    listen 443 ssl http2;
    server_name goprmpt.com;

    root /var/www/goprmpt.com/dist;
    index index.html;

    # 静态资源缓存
    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # 优化器（goprmpt.net）跨域读取静态目录和单条导入接口
    location ^~ /api/public/ {
        add_header Access-Control-Allow-Origin "https://goprmpt.net" always;
        add_header Access-Control-Allow-Methods "GET, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Accept, Content-Type" always;
        add_header Vary "Origin" always;

        if ($request_method = OPTIONS) {
            return 204;
        }

        try_files $uri =404;
    }

    # 无后缀导入码文件显式返回 application/json; charset=utf-8
    location ^~ /api/public/prompt-source/ {
        default_type application/json;
        charset utf-8;
        charset_types application/json;

        add_header Access-Control-Allow-Origin "https://goprmpt.net" always;
        add_header Access-Control-Allow-Methods "GET, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Accept, Content-Type" always;
        add_header Vary "Origin" always;

        if ($request_method = OPTIONS) {
            return 204;
        }

        try_files $uri =404;
    }

    # 静态多页入口
    location / {
        try_files $uri $uri/ =404;
    }
}
```

> 说明：在 Nginx / OpenResty 中，子 `location` 只要写了 `add_header`，就不会继承外层的 `add_header`，因此 `/api/public/prompt-source/` 中需要保留完整的 CORS 响应头与 `OPTIONS` 204 处理。

## 上线后验收命令

配置重载（`openresty -t && openresty -s reload`）后，执行以下检查：

```bash
# 1. 页面可访问
curl -fsSI https://goprmpt.com/
curl -fsSI https://goprmpt.com/library/
curl -fsSI https://goprmpt.com/learn/

# 2. 无后缀导入文件返回 application/json; charset=utf-8 和 CORS 头
curl -fsSI -H "Origin: https://goprmpt.net" \
  https://goprmpt.com/api/public/prompt-source/plain-language-explainer

# 3. 预检请求返回 204
curl -fsSI -X OPTIONS -H "Origin: https://goprmpt.net" \
  https://goprmpt.com/api/public/prompts/catalog/zh/basic-user.json
```
