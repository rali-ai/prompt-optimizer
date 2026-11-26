#!/bin/sh
set -eu

# 运行时配置文件路径（仅注入显式白名单内的非敏感环境变量）
CONFIG_FILE="${CONFIG_FILE:-/usr/share/nginx/html/config.js}"
TARGET_DIR=$(dirname "$CONFIG_FILE")

if [ ! -d "$TARGET_DIR" ]; then
    mkdir -p "$TARGET_DIR"
fi

CONFIG_FILE="$CONFIG_FILE" node -e '
const fs = require("node:fs");

const ALLOWLIST = [
  "VITE_ENABLE_PROMPT_GARDEN_IMPORT",
  "VITE_PROMPT_GARDEN_BASE_URL",
  "VITE_GOOGLE_DRIVE_CLIENT_ID",
  "VITE_APP_VERSION",
];

const runtimeConfig = {};
let injectedCount = 0;

for (const key of ALLOWLIST) {
  const value = process.env[key];
  if (typeof value === "string" && value.length > 0) {
    runtimeConfig[key.replace(/^VITE_/, "")] = value;
    runtimeConfig[key] = value;
    injectedCount += 1;
  }
}

const serialized = JSON.stringify(runtimeConfig, null, 2)
  .replace(/</g, "\\u003c")
  .replace(/\u2028/g, "\\u2028")
  .replace(/\u2029/g, "\\u2029");

const content = [
  "// 此文件由容器启动时生成，仅注入白名单内的非敏感前端运行时配置",
  `window.runtime_config = Object.assign({}, (window.runtime_config || {}), ${serialized});`,
  "",
].join("\n");

fs.writeFileSync(process.env.CONFIG_FILE, content, "utf8");
console.log(`Runtime config generated (${injectedCount} allowlisted keys injected).`);
'

if [ ! -f "$CONFIG_FILE" ]; then
    echo "ERROR: Failed to generate runtime config: $CONFIG_FILE" >&2
    exit 1
fi
