#!/bin/sh

# The htpasswd file lives on the /data volume so a password changed through
# /auth-api/password survives restarts and container recreation.
HTPASSWD_FILE=/data/auth/.htpasswd

if [ -n "$ACCESS_PASSWORD" ]; then
    echo "启用Basic认证..."

    mkdir -p "$(dirname "$HTPASSWD_FILE")"

    if [ -s "$HTPASSWD_FILE" ]; then
        echo "沿用已有密码文件 $HTPASSWD_FILE（ACCESS_PASSWORD 仅用于首次初始化）"
    else
        USERNAME=${ACCESS_USERNAME:-admin}
        # printf avoids a trailing newline; -B writes a bcrypt hash.
        printf '%s' "$ACCESS_PASSWORD" | htpasswd -i -B -c "$HTPASSWD_FILE" "$USERNAME"
        echo "已用 ACCESS_PASSWORD 初始化密码文件，用户名: $USERNAME"
    fi

    # nginx workers run as an unprivileged user and must read the file.
    chmod a+r "$HTPASSWD_FILE"

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
