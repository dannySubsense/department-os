import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
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
