import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  resolve: {
    alias: {
      '@quiz/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true },
  test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'] },
});
