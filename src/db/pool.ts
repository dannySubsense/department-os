import { Pool } from 'pg';

const connectionString =
  process.env.DATABASE_URL ?? 'postgres://deptos:deptos@localhost:55432/deptos_core';

export const pool = new Pool({ connectionString });
