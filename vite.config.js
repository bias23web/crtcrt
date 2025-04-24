import { defineConfig, loadEnv } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd());

  const API_URL = `${env.VITE_API_URL ?? 'http://localhost:3000/api'}`;
  const PORT = `${env.VITE_PORT ?? '3000'}`;
  const WS_URL = `${env.VITE_WS_URL ?? 'ws://localhost:3000'}`;

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    server: {
      proxy: {
        '/api': {
          target: API_URL,
          changeOrigin: true,
        },
        '/ws': {
          target: WS_URL,
          ws: true,
        }
      }
    }
  }
})