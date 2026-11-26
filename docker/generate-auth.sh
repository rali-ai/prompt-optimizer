#!/bin/sh

# The htpasswd file lives on the /data volume so a password changed through
# /auth-api/password survives restarts and container recreation.
HTPASSWD_FILE=/data/auth/.htpasswd

if [ -n "$ACCESS_PASSWORD" ]; then
    if [ "$ACCESS_PASSWORD" = "123456" ]; then
        echo "ERROR: ACCESS_PASSWORD 不能使用默认弱口令 123456，请配置至少 8 位的强密码或留空以禁用 Basic 认证。" >&2
        exit 1
    fi

    if [ "${#ACCESS_PASSWORD}" -lt 8 ]; then
        echo "WARNING: ACCESS_PASSWORD 长度小于 8 位，存在弱口令风险，请尽快更换为更强的密码！" >&2
    fi

    echo "启用Basic认证..."

    HTPASSWD_DIR=$(dirname "$HTPASSWD_FILE")
    mkdir -p "$HTPASSWD_DIR"

    if [ -s "$HTPASSWD_FILE" ]; then
        echo "沿用已有密码文件 $HTPASSWD_FILE（ACCESS_PASSWORD 仅用于首次初始化）"
    else
        USERNAME=${ACCESS_USERNAME:-admin}
        # printf avoids a trailing newline; -B writes a bcrypt hash.
        printf '%s' "$ACCESS_PASSWORD" | htpasswd -i -B -c "$HTPASSWD_FILE" "$USERNAME"
        echo "已用 ACCESS_PASSWORD 初始化密码文件，用户名: $USERNAME"
    fi

    # nginx workers run in the nginx group; restrict permissions so unprivileged node services cannot read .htpasswd.
    if chown root:nginx "$HTPASSWD_DIR" 2>/dev/null; then
        chmod 750 "$HTPASSWD_DIR"
    fi
    if chown root:nginx "$HTPASSWD_FILE" 2>/dev/null; then
        chmod 640 "$HTPASSWD_FILE"
    else
        chmod 644 "$HTPASSWD_FILE"
    fi

    cat > /etc/nginx/http.d/auth.conf << EOF
# 此文件由generate-auth.sh脚本自动生成
auth_basic "请输入访问凭据 (Please enter your credentials)";
auth_basic_user_file $HTPASSWD_FILE;
EOF
else
    echo "未设置ACCESS_PASSWORD环境变量，不启用Basic认证"

    cat > /etc/nginx/http.d/auth.conf << EOF
# Basic认证未启用
auth_basic off;
EOF
fi
