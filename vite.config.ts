import { defineConfig } from 'vite'
import path from 'node:path'
import tailwindcss from "@tailwindcss/vite"
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'


// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron({

      main: {
        // Shortcut of `build.lib.entry`.
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              // ### ### ### КРИТИЧЕСКИ ВАЖНАЯ НАСТРОЙКА: ВНЕШНИЕ ЗАВИСИМОСТИ ### ### ###
              // Добавляем 'better-sqlite3' в список внешних зависимостей.
              // Это означает, что Rollup НЕ будет включать его в бандл main.js.
              // Electron загрузит его как обычный Node.js модуль во время выполнения.
              external: ['better-sqlite3', 'websocket', '@kasplex/kiwi'],
            }
          }
        }
      },
      preload: {
        // Shortcut of `build.rollupOptions.input`.
        // Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
        input: path.join(__dirname, 'electron/preload.ts'),
      },
      // Ployfill the Electron and Node.js API for Renderer process.
      // If you want use Node.js in Renderer process, the `nodeIntegration` needs to be enabled in the Main process.
      // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
      renderer: process.env.NODE_ENV === 'test'
        // https://github.com/electron-vite/vite-plugin-electron-renderer/issues/78#issuecomment-2053600808
        ? undefined
        : {},

    }),
    tailwindcss()
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },


})
