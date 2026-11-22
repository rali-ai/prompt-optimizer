// 启动入口：读环境变量，按 MP_DEV / LLM_FAKE 选真实或模拟的依赖，监听端口。
import { loadConfig } from './config.js'
import { createApp } from './app.js'
import { createWechat, devWechat } from './wechat.js'
import { createLlm, fakeLlm } from './llm.js'

let config
try {
  config = loadConfig(process.env)
} catch (error) {
  console.error('配置错误：' + error.message)
  process.exit(1)
}

const wechat = config.dev ? devWechat : createWechat({ appid: config.appid, secret: config.secret })
const llm = config.llmFake ? fakeLlm : createLlm(config.llm)
const server = createApp({ config, wechat, llm })

server.listen(config.port, () => {
  const flags = [config.dev && 'MP_DEV（跳过微信接口）', config.llmFake && 'LLM_FAKE（模拟模型）'].filter(Boolean)
  console.log(`mp-server 已启动：http://localhost:${server.address().port}` + (flags.length ? ' · ' + flags.join(' · ') : ''))
})

const stop = () => server.close(() => process.exit(0))
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
