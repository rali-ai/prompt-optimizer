FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787
# 没有任何 npm 依赖，只拷源码。
COPY package.json ./
COPY src ./src
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:${PORT}/healthz || exit 1
CMD ["node", "src/main.js"]
