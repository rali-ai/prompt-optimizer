#!/bin/sh

# 创建日志目录与持久化数据目录（确保 user-sync-api 以 node 用户运行可无缝读写）
mkdir -p /var/log/supervisor
mkdir -p /data/user-sync && chown -R node:node /data/user-sync 2>/dev/null || true

# 处理nginx配置文件中的环境变量
echo "Processing nginx configuration with environment variables..."
envsubst '${NGINX_PORT}' < /etc/nginx/http.d/default.conf > /tmp/nginx.conf
mv /tmp/nginx.conf /etc/nginx/http.d/default.conf
echo "Nginx configuration updated with NGINX_PORT=${NGINX_PORT}"

# 运行初始化脚本（任一初始化失败时中止启动，避免弱口令或缺失认证配置静默启动）
echo "Running nginx initialization scripts..."
for script in /docker-entrypoint.d/*.sh; do
    if [ -f "$script" ]; then
        echo "Running $script"
        if ! sh "$script"; then
            echo "ERROR: $script failed, aborting startup." >&2
            exit 1
        fi
    fi
done

# 验证config.js是否已生成（不输出配置内容，防止日志泄露）
if [ -f "/usr/share/nginx/html/config.js" ]; then
    echo "✅ config.js generated successfully"
else
    echo "❌ ERROR: config.js was not generated!"
    echo "Attempting manual generation..."
    sh /docker-entrypoint.d/40-generate-config.sh || exit 1
fi

echo "Starting services with supervisor..."
echo "MCP Server will run on port: ${MCP_HTTP_PORT}"
echo "MCP Server log level: ${MCP_LOG_LEVEL}"

# 启动supervisor
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
