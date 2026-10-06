/**
 * Postgres persistence for the in-memory store (Neon on Vercel, or any Postgres).
 *
 * The whole `Store` is kept as one JSONB document in `thesisfic_store` with a version counter.
 * Each server instance keeps a copy in memory, re-reads the row when the version moved
 * (see `db.ready()`), and writes the document after every mutation (see `db.persist()`).
 * Configured by `DATABASE_URL` (or `POSTGRES_URL`); without it the store stays in memory.
 */
import { Pool } from "pg";

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
export const storeConfigured = Boolean(url);

const ROW_ID = "main";
const g = globalThis as unknown as { __thesisficPool?: Pool; __thesisficTable?: Promise<void> };

function pool(): Pool {
  if (!g.__thesisficPool) {
    const local = /localhost|127\.0\.0\.1/.test(url);
    g.__thesisficPool = new Pool({
      connectionString: url,
      max: 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
      ssl: local ? undefined : { rejectUnauthorized: false },
    });
    g.__thesisficPool.on("error", (e) => console.warn("store: pool error", e.message));
  }
  return g.__thesisficPool;
}

export function ensureTable(): Promise<void> {
  if (!g.__thesisficTable) {
    g.__thesisficTable = pool()
      .query(
        `CREATE TABLE IF NOT EXISTS thesisfic_store (
           id text PRIMARY KEY,
           data jsonb NOT NULL,
           version bigint NOT NULL DEFAULT 1,
           updated_at timestamptz NOT NULL DEFAULT now()
         )`,
      )
      .then(() => undefined)
      .catch((e) => {
        g.__thesisficTable = undefined;
        throw e;
      });
  }
  return g.__thesisficTable;
}

export async function readVersion(): Promise<number | null> {
  const r = await pool().query<{ version: string }>("SELECT version FROM thesisfic_store WHERE id = $1", [ROW_ID]);
  return r.rows[0] ? Number(r.rows[0].version) : null;
}

export async function readStore<T>(): Promise<{ data: T; version: number } | null> {
  const r = await pool().query<{ data: T; version: string }>("SELECT data, version FROM thesisfic_store WHERE id = $1", [ROW_ID]);
  return r.rows[0] ? { data: r.rows[0].data, version: Number(r.rows[0].version) } : null;
}

/** Upserts the document; returns the new version. */
export async function writeStore(json: string): Promise<number> {
  const r = await pool().query<{ version: string }>(
    `INSERT INTO thesisfic_store (id, data, version, updated_at) VALUES ($1, $2::jsonb, 1, now())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = thesisfic_store.version + 1, updated_at = now()
     RETURNING version`,
    [ROW_ID, json],
  );
  return Number(r.rows[0].version);
}
