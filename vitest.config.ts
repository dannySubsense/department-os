import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Slice 1 (Mission Control Shell) introduces React component tests under src/client/ — those
    // need a DOM (jsdom), while every other test in the repo is a real-Postgres integration test
    // that must stay on the 'node' environment. environmentMatchGlobs scopes jsdom to src/client/
    // only, matching Vitest's documented per-file-pattern environment override.
    environmentMatchGlobs: [['src/client/**', 'jsdom']],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    testTimeout: 15000,
    // Test files share one real Postgres instance (DDR-0001) and each test's `beforeEach`
    // does `TRUNCATE ... CASCADE` against tables another file's in-flight transaction may
    // still hold locks on. Vitest's default file parallelism let two files' fixture-reset
    // TRUNCATE and another file's multi-statement transaction race, producing a genuine
    // Postgres "deadlock detected" (reproduced via stress test — see submitSources.ts).
    // Running files sequentially removes the cross-file race; it does not mask an app-level
    // bug — concurrent submitSources calls against each other do not deadlock (verified with
    // 240 concurrent calls against a single Investigation, 0 failures).
    fileParallelism: false,
  },
});
