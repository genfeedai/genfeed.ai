import { PGlite } from '@electric-sql/pglite';

const DB_NAME = 'idb://genfeed-desktop';

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT,
    title TEXT NOT NULL DEFAULT 'New conversation',
    status TEXT NOT NULL DEFAULT 'idle',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    draft_id TEXT,
    generated_content TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_threads_user ON threads(user_id);
  CREATE INDEX IF NOT EXISTS idx_threads_workspace ON threads(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);

  CREATE TABLE IF NOT EXISTS sync_log (
    id TEXT PRIMARY KEY,
    entity TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    direction TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    synced_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sync_log_status ON sync_log(status);
`;

let db: PGlite | null = null;
let initPromise: Promise<PGlite> | null = null;

export async function getDb(): Promise<PGlite> {
  if (typeof window === 'undefined') {
    throw new Error('PGlite is only available in the browser');
  }

  if (db) return db;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const instance = new PGlite(DB_NAME, { relaxedDurability: true });
    await instance.exec(SCHEMA_SQL);
    db = instance;
    return instance;
  })();

  return initPromise;
}

export async function ensureUser(userId: string): Promise<void> {
  const instance = await getDb();
  await instance.query(
    'INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING',
    [userId],
  );
}

/* ─── Sync Log ─── */

export interface SyncLogRow {
  direction: 'pull' | 'push';
  entity: 'message' | 'thread';
  entity_id: string;
  error?: string;
  id: string;
  status: 'failed' | 'pending' | 'success';
  synced_at?: string;
}

export async function getPendingSyncCount(): Promise<number> {
  const instance = await getDb();
  const result = await instance.query<{ count: string }>(
    "SELECT COUNT(*) AS count FROM sync_log WHERE status = 'pending'",
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function upsertSyncLogEntry(entry: SyncLogRow): Promise<void> {
  const instance = await getDb();
  await instance.query(
    `INSERT INTO sync_log (id, entity, entity_id, direction, status, error, synced_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET
       status = EXCLUDED.status,
       error = EXCLUDED.error,
       synced_at = EXCLUDED.synced_at`,
    [
      entry.id,
      entry.entity,
      entry.entity_id,
      entry.direction,
      entry.status,
      entry.error ?? null,
      entry.synced_at ?? null,
    ],
  );
}

export async function markSyncSuccess(
  id: string,
  syncedAt: string,
): Promise<void> {
  const instance = await getDb();
  await instance.query(
    "UPDATE sync_log SET status = 'success', synced_at = $2, error = NULL WHERE id = $1",
    [id, syncedAt],
  );
}

export async function markSyncFailed(id: string, error: string): Promise<void> {
  const instance = await getDb();
  await instance.query(
    "UPDATE sync_log SET status = 'failed', error = $2 WHERE id = $1",
    [id, error],
  );
}
