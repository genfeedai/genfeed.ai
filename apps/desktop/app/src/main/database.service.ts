import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { app } from 'electron';

export interface WorkspaceRow {
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

export interface SyncJobRow {
  createdAt: string;
  error: string | null;
  id: string;
  payload: string;
  status: string;
  type: string;
  updatedAt: string;
  workspaceId: string | null;
}

export class DesktopDatabaseService {
  private readonly db: Database;

  constructor() {
    const userData = app.getPath('userData');
    fs.mkdirSync(userData, { recursive: true });

    this.db = new Database(path.join(userData, 'genfeed-desktop.sqlite'));
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workspace_registry (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        linkedProjectId TEXT,
        fileIndex TEXT NOT NULL DEFAULT '[]',
        indexingState TEXT NOT NULL DEFAULT 'idle',
        localDraftCount INTEGER NOT NULL DEFAULT 0,
        pendingSyncCount INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        lastOpenedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_jobs (
        id TEXT PRIMARY KEY,
        workspaceId TEXT,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL,
        error TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS recent_items (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        label TEXT NOT NULL,
        value TEXT NOT NULL,
        openedAt TEXT NOT NULL
      );
    `);
  }

  getValue(key: string): string | null {
    const row = this.db
      .prepare('SELECT value FROM kv_store WHERE key = ?')
      .get(key) as { value: string } | undefined;

    return row?.value ?? null;
  }

  setValue(key: string, value: string): void {
    this.db
      .prepare(
        `
          INSERT INTO kv_store (key, value)
          VALUES (@key, @value)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `,
      )
      .run({ key, value });
  }

  deleteValue(key: string): void {
    this.db.prepare('DELETE FROM kv_store WHERE key = ?').run(key);
  }

  listWorkspaces(): WorkspaceRow[] {
    return this.db
      .prepare(
        `
          SELECT *
          FROM workspace_registry
          ORDER BY lastOpenedAt DESC
        `,
      )
      .all() as WorkspaceRow[];
  }

  getWorkspaceById(id: string): WorkspaceRow | null {
    const row = this.db
      .prepare('SELECT * FROM workspace_registry WHERE id = ?')
      .get(id) as WorkspaceRow | undefined;

    return row ?? null;
  }

  upsertWorkspace(row: WorkspaceRow): void {
    this.db
      .prepare(
        `
          INSERT INTO workspace_registry (
            id,
            name,
            path,
            linkedProjectId,
            fileIndex,
            indexingState,
            localDraftCount,
            pendingSyncCount,
            createdAt,
            updatedAt,
            lastOpenedAt
          ) VALUES (
            @id,
            @name,
            @path,
            @linkedProjectId,
            @fileIndex,
            @indexingState,
            @localDraftCount,
            @pendingSyncCount,
            @createdAt,
            @updatedAt,
            @lastOpenedAt
          )
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            path = excluded.path,
            linkedProjectId = excluded.linkedProjectId,
            fileIndex = excluded.fileIndex,
            indexingState = excluded.indexingState,
            localDraftCount = excluded.localDraftCount,
            pendingSyncCount = excluded.pendingSyncCount,
            updatedAt = excluded.updatedAt,
            lastOpenedAt = excluded.lastOpenedAt
        `,
      )
      .run(row);
  }

  listSyncJobs(workspaceId?: string): SyncJobRow[] {
    if (workspaceId) {
      return this.db
        .prepare(
          `
            SELECT *
            FROM sync_jobs
            WHERE workspaceId = ?
            ORDER BY updatedAt DESC
          `,
        )
        .all(workspaceId) as SyncJobRow[];
    }

    return this.db
      .prepare(
        `
          SELECT *
          FROM sync_jobs
          ORDER BY updatedAt DESC
        `,
      )
      .all() as SyncJobRow[];
  }

  upsertSyncJob(row: SyncJobRow): void {
    this.db
      .prepare(
        `
          INSERT INTO sync_jobs (
            id,
            workspaceId,
            type,
            payload,
            status,
            error,
            createdAt,
            updatedAt
          ) VALUES (
            @id,
            @workspaceId,
            @type,
            @payload,
            @status,
            @error,
            @createdAt,
            @updatedAt
          )
          ON CONFLICT(id) DO UPDATE SET
            workspaceId = excluded.workspaceId,
            type = excluded.type,
            payload = excluded.payload,
            status = excluded.status,
            error = excluded.error,
            updatedAt = excluded.updatedAt
        `,
      )
      .run(row);
  }

  listRecentItems(): Array<{
    id: string;
    kind: string;
    label: string;
    openedAt: string;
    value: string;
  }> {
    return this.db
      .prepare(
        `
          SELECT *
          FROM recent_items
          ORDER BY openedAt DESC
          LIMIT 12
        `,
      )
      .all() as Array<{
      id: string;
      kind: string;
      label: string;
      openedAt: string;
      value: string;
    }>;
  }

  upsertRecentItem(item: {
    id: string;
    kind: string;
    label: string;
    openedAt: string;
    value: string;
  }): void {
    this.db
      .prepare(
        `
          INSERT INTO recent_items (id, kind, label, value, openedAt)
          VALUES (@id, @kind, @label, @value, @openedAt)
          ON CONFLICT(id) DO UPDATE SET
            kind = excluded.kind,
            label = excluded.label,
            value = excluded.value,
            openedAt = excluded.openedAt
        `,
      )
      .run(item);
  }
}
