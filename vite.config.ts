import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig, loadEnv } from 'vite'
import viteReact from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Apply `.env` to `process.env` for server functions (same pattern as Playwright config). */
function applyEnvFiles(mode: string): void {
  const fromFiles = loadEnv(mode, __dirname, '')
  for (const [key, value] of Object.entries(fromFiles)) {
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

export default defineConfig(({ mode }) => {
  applyEnvFiles(mode)

  return {
    server: {
      port: 3000,
      host: '127.0.0.1',
      allowedHosts: process.env.DASHBOARD_ALLOWED_HOST
        ? [process.env.DASHBOARD_ALLOWED_HOST]
        : undefined,
    },
    resolve: {
      alias: {
        '~': path.resolve(__dirname, './src'),
      },
    },
    plugins: [
      tanstackStart({
        srcDirectory: 'src',
      }),
      viteReact(),
    ],
  }
})
