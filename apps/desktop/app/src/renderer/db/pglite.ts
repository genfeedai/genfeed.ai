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
