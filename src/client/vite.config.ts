import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Mirrors src/db/migrate.ts's MIGRATIONS_DIR pattern — resolves to this config file's own
// directory regardless of the cwd the `vite`/`vite build` process is invoked from.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname, // explicit: Vite's default root is process.cwd(), not this file's directory —
  // without this, outDir below resolves relative to the wrong base (Danny's correction).
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, '../web/public'), // now correct, because root above is
    // no longer implicit
    // emptyOutDir intentionally false (deviating from the architecture sketch's literal
    // `emptyOutDir: true`): src/web/public/ is NOT build-output-only in the current repo state —
    // it already carries hand-authored legacy assets (submission-screen.js,
    // submission-screen.test.ts) served by the existing /investigations/* Express routes
    // (src/web/views.ts). A literal `emptyOutDir: true` deletes those on every `npm run build`,
    // which is a real conflict with this file's own architecture note ("no hand-authored file is
    // ever added there") — that note assumed a state this repo is not actually in. Left false to
    // avoid destroying existing hand-authored files; the SPA's own assets are content-hashed
    // (Vite default) so stale bundle files accumulating in `assets/` is a cosmetic cost, not a
    // correctness one.
    emptyOutDir: false,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000', // existing Express PORT default, server.ts:167
        changeOrigin: true,
      },
    },
  },
});
