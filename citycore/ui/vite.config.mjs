import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';
export default defineConfig({ root: path.resolve('ui'), base: './', plugins: [vue()], build: { target: 'chrome80', outDir: path.resolve('release/ragemp/client_packages/citycore/ui'), emptyOutDir: true }, server: { port: 5173, strictPort: true } });
