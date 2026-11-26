import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import path from 'path'
import { DEFAULT_VITE_ENV } from '../core/src/utils/default-env'
import { createPwaPlugin } from './pwa.config'

const SAFE_PUBLIC_ENV_KEYS = new Set<string>([
  ...Object.keys(DEFAULT_VITE_ENV),
  'VITE_GOOGLE_DRIVE_CLIENT_ID',
  'VITE_APP_VERSION',
  'VITE_APP_PLATFORM',
  'VITE_LOCAL_DEV',
  'VITE_WORKSPACE_PREVIEW',
  'VITE_ENABLE_PROMPT_GARDEN_IMPORT',
  'VITE_PROMPT_GARDEN_BASE_URL',
])

const SENSITIVE_ENV_KEY_PATTERN = /(?:API_KEY|API_TOKEN|SECRET|PASSWORD|CUSTOM_API)/i

function buildSafeProcessEnv(env: Record<string, string>): Record<string, string> {
  const safeEnv: Record<string, string> = {
    ...DEFAULT_VITE_ENV,
  }
  for (const [key, value] of Object.entries(env)) {
    if (!SAFE_PUBLIC_ENV_KEYS.has(key) || SENSITIVE_ENV_KEY_PATTERN.test(key)) {
      continue
    }
    safeEnv[key] = value
  }
  return safeEnv
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const monorepoRoot = resolve(__dirname, '../..')
  const env = loadEnv(mode, monorepoRoot)
  const processEnv = buildSafeProcessEnv(env)

  return {
    envDir: monorepoRoot,
    plugins: [vue(), createPwaPlugin()],
    server: {
      port: 18181,
      host: true,
      fs: {
        // 允许为工作区依赖提供服务
        allow: ['..']
      },
      hmr: true,
      watch: {
        // 确保监视monorepo中其他包的变化
        ignored: ['!**/node_modules/@prompt-optimizer/**']
      }
    },
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html')
        }
      }
    },
    publicDir: 'public',
    resolve: {
      preserveSymlinks: true,
      alias: {
        '@': resolve(__dirname, 'src'),
        '@prompt-optimizer/core': path.resolve(__dirname, '../core'),
        '@prompt-optimizer/ui': path.resolve(__dirname, '../ui'),
        '@prompt-optimizer/web': path.resolve(__dirname, '../web'),
        '@prompt-optimizer/extension': path.resolve(__dirname, '../extension')
      }
    },
    define: {
      'process.env': {
        NODE_ENV: JSON.stringify(process.env.NODE_ENV || 'development'),
        ...processEnv,
      }
    }
  }
})
