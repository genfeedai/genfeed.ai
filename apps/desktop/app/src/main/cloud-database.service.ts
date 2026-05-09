import fs from 'node:fs';
import { createRequire } from 'node:module';

export interface LegacySqliteKvRow {
  key: string;
  value: string;
}

export interface LegacySqliteWorkspaceRow {
  createdAt: string;
  fileIndex: string;
  id: string;
  indexingState: string;
  lastOpenedAt: string;
  linkedProjectId: string | null;
  localDraftCount: number;
  name: string;
  path: string;
  pendingSyncCount: number;
  updatedAt: string;
}

export interface LegacySqliteSyncJobRow {
  createdAt: string;
  error: string | null;
  id: string;
  payload: string;
  retryCount: number;
  status: string;
  type: string;
  updatedAt: string;
  workspaceId: string | null;
}

export interface LegacySqliteRecentItemRow {
  id: string;
  kind: string;
  label: string;
  openedAt: string;
  value: string;
}

type SqliteDatabase = {
  close: () => void;
  prepare: (sql: string) => {
    all: () => unknown[];
  };
};

const require = createRequire(__filename);

export class LegacySqliteReader {
  static tryOpen(databasePath: string): LegacySqliteReader | null {
    if (!fs.existsSync(databasePath)) {
      return null;
    }

    const BetterSqlite3 = require('better-sqlite3') as new (
      filename: string,
      options?: { readonly?: boolean },
    ) => SqliteDatabase;

    return new LegacySqliteReader(
      new BetterSqlite3(databasePath, {
        readonly: true,
      }),
    );
  }

  constructor(private readonly db: SqliteDatabase) {}

  readKvStore(): LegacySqliteKvRow[] {
    return this.db
      .prepare('SELECT key, value FROM kv_store')
      .all() as LegacySqliteKvRow[];
  }

  readWorkspaceRegistry(): LegacySqliteWorkspaceRow[] {
    return this.db
      .prepare('SELECT * FROM workspace_registry')
      .all() as LegacySqliteWorkspaceRow[];
  }

  readSyncJobs(): LegacySqliteSyncJobRow[] {
    return this.db
      .prepare('SELECT * FROM sync_jobs')
      .all() as LegacySqliteSyncJobRow[];
  }

  readRecentItems(): LegacySqliteRecentItemRow[] {
    return this.db
      .prepare('SELECT * FROM recent_items')
      .all() as LegacySqliteRecentItemRow[];
  }

  close(): void {
    this.db.close();
  }
}
