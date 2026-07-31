import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  server: { port: 5188, fs: { allow: [path.resolve(__dirname, '..')] } }
});
