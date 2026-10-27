import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // strictPort 必须为 true：Tauri 的 devUrl 写死了 5183，
  // 端口被占时 vite 如果自己漂到 5184，Tauri 会连不上并白屏
  server: { port: 5183, strictPort: true },
  build: { outDir: 'dist', sourcemap: false },
});
