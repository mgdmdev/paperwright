import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';
import { playgroundApi } from '../playground/server/api';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Built workspace packages (dist) are not refreshable sources; the refresh runtime they would be
  // wrapped in also assumes a window, which the preview worker does not have.
  plugins: [react({ exclude: [/node_modules/, /\/dist\//] }), playgroundApi(path.resolve(here, '../../examples/basic'), path.resolve(here, '../../.paperwright/assets'))],
  // The in-browser preview runs Forme's web-target build, which is behind the "worker" condition.
  resolve: { conditions: ['worker', ...defaultClientConditions] },
  worker: { format: 'es' },
  server: { port: 5181, strictPort: true },
});
