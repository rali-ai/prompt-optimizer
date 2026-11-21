export const DEFAULT_VITE_ENV = {
  VITE_ENABLE_PROMPT_GARDEN_IMPORT: '0',
  VITE_PROMPT_GARDEN_BASE_URL: '',
} as const

export type DefaultViteEnvKey = keyof typeof DEFAULT_VITE_ENV

export const getDefaultEnvVar = (key: string): string => {
  return DEFAULT_VITE_ENV[key as DefaultViteEnvKey] ?? ''
}
