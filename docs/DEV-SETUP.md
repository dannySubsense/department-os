# Dev Setup — Problem Department MVP Implementation

Codebase established starting Slice 2 of `docs/specs/problem-department-mvp/04-ROADMAP.md`. See
`docs/decisions/DDR-0001-problem-department-runtime.md` for the runtime/storage decision this
codebase is built on.

## Stack (established Slice 2)

- **Language/runtime:** TypeScript on Node.js.
- **Web layer:** Express, server-rendered HTML (template functions in `src/web/views.ts`) with a
  small amount of vanilla client-side JS (`src/web/public/submission-screen.js`) for form
  interactions. No frontend framework — the UI Spec does not require one and this keeps the
  vertical slice minimal.
- **Persistence:** PostgreSQL via `pg` (node-postgres) — no ORM. Plain parameterized SQL,
  matching DDR-0001's "minimal effort to stand up" capability row and the confirmed
  FK-integrity/immutability spike.
- **Tests:** Vitest, run against the real dev Postgres (per DDR-0001 — no mocked/in-memory
  storage substitute).

Directory layout:

```
src/
  db/           pool.ts, migrate.ts, migrations/ (numbered .sql files)
  types/        domain.ts — Architecture §3 schemas, copied exactly
  services/     submitSources.ts (+ its test)
  web/          server.ts (Express routes), views.ts (HTML templates), public/ (static JS)
```

## Running locally

### 1. Start the dev Postgres

A real, persistent (not throwaway) local Postgres, per DDR-0001:

```bash
docker-compose up -d
```

This starts `postgres:16-alpine` on `localhost:55432`, database `deptos_core`, with a named
Docker volume (`deptos_core_pgdata`) — data survives container restarts. This replaces Slice 1's
scratch-only spike container (`dept-os-core-pg`, anonymous volume — removed), and is physically
separate from the LORE Postgres instance.

Copy `.env.example` to `.env` (gitignored) for a local override of `DATABASE_URL`/`PORT`; the
defaults already point at the compose service above.

### 2. Apply the schema

```bash
npm install
npm run migrate
```

Applies each file under `src/db/migrations/` (in numeric order) that isn't already recorded in
the `schema_migrations` tracking table, inside its own transaction. Safe to re-run — already-applied
migrations are skipped, and the command reports exactly which files it applied (or "No migrations
to apply" if the database is already current). This also means a database provisioned before a
later migration existed will correctly pick up that migration on the next `npm run migrate`,
rather than the run silently no-oping.

To add a schema change in a future slice, add a new `src/db/migrations/NNN_description.sql` file
— never edit an already-applied migration file in place.

### 3. Run the dev server

```bash
npm run dev
```

Serves on `http://localhost:3000` (override with `PORT`). Visit `/investigations/new` to submit
sources; on success you're redirected to `/investigations/{id}`, the durable Investigation URL
(currently only its Generating state — Blocked/Generation-Failed/Completed states are built in
later slices).

### 4. Run tests

```bash
DATABASE_URL=postgres://deptos:deptos@localhost:55432/deptos_core npm test
```

Tests run against the real dev Postgres started in step 1 and require the schema to already be
migrated.

## Type checking

```bash
npm run build   # tsc --noEmit
```
