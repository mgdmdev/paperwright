import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { playgroundApi } from './server/api';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), playgroundApi(path.resolve(here, '../../examples/basic'))],
  server: { port: 5180, strictPort: true },
});
