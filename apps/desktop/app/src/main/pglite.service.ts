import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { NodeFS } from '@electric-sql/pglite/nodefs';
import { app } from 'electron';

const DESKTOP_SCHEMA_MIGRATION_TABLE = 'desktop_schema_migrations';

const DESKTOP_MIGRATIONS = [
  {
    version: '20260420_001_desktop_prisma_bootstrap',
    sql: `
      CREATE TABLE IF NOT EXISTS desktop_kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS desktop_workspace (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        linked_project_id TEXT,
        file_index TEXT NOT NULL DEFAULT '[]',
        indexing_state TEXT NOT NULL DEFAULT 'idle',
        local_draft_count INTEGER NOT NULL DEFAULT 0,
        pending_sync_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_opened_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_desktop_workspace_last_opened_at
        ON desktop_workspace (last_opened_at DESC);

      CREATE TABLE IF NOT EXISTS desktop_sync_job (
        id TEXT PRIMARY KEY,
        workspace_id TEXT,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL,
        error TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_desktop_sync_job_workspace_updated
        ON desktop_sync_job (workspace_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_desktop_sync_job_status_updated
        ON desktop_sync_job (status, updated_at DESC);

      CREATE TABLE IF NOT EXISTS desktop_recent_item (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        label TEXT NOT NULL,
        value TEXT NOT NULL,
        opened_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_desktop_recent_item_opened_at
        ON desktop_recent_item (opened_at DESC);

      CREATE TABLE IF NOT EXISTS desktop_organization (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS desktop_user (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES desktop_organization (id) ON DELETE CASCADE,
        clerk_id TEXT UNIQUE,
        email TEXT,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_desktop_user_organization_id
        ON desktop_user (organization_id);

      CREATE TABLE IF NOT EXISTS desktop_project (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES desktop_organization (id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_desktop_project_organization_updated
        ON desktop_project (organization_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS desktop_content_item (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES desktop_organization (id) ON DELETE CASCADE,
        project_id TEXT REFERENCES desktop_project (id) ON DELETE SET NULL,
        platform TEXT NOT NULL,
        type TEXT NOT NULL,
        prompt TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL,
        publish_intent TEXT,
        source_draft_id TEXT UNIQUE,
        source_trend_id TEXT,
        source_trend_topic TEXT,
        published_at TEXT,
        views INTEGER NOT NULL DEFAULT 0,
        engagements INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_desktop_content_item_organization_updated
        ON desktop_content_item (organization_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_desktop_content_item_status_published
        ON desktop_content_item (status, published_at DESC);
      CREATE INDEX IF NOT EXISTS idx_desktop_content_item_platform_updated
        ON desktop_content_item (platform, updated_at DESC);

      CREATE TABLE IF NOT EXISTS desktop_trend (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES desktop_organization (id) ON DELETE CASCADE,
        platform TEXT NOT NULL,
        topic TEXT NOT NULL,
        summary TEXT,
        virality_score INTEGER NOT NULL,
        engagement_score INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_desktop_trend_org_platform_topic
        ON desktop_trend (organization_id, platform, topic);

      CREATE TABLE IF NOT EXISTS desktop_ingredient (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES desktop_organization (id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        platform TEXT,
        total_votes INTEGER NOT NULL DEFAULT 0,
        source_content_item_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_desktop_ingredient_org_updated
        ON desktop_ingredient (organization_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_desktop_ingredient_platform_votes
        ON desktop_ingredient (platform, total_votes DESC);

      CREATE TABLE IF NOT EXISTS desktop_agent (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES desktop_organization (id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        avatar TEXT,
        platforms_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        last_run_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_desktop_agent_org_updated
        ON desktop_agent (organization_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS desktop_agent_run (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL REFERENCES desktop_agent (id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_desktop_agent_run_agent_started
        ON desktop_agent_run (agent_id, started_at DESC);

      CREATE TABLE IF NOT EXISTS desktop_workflow (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES desktop_organization (id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        lifecycle TEXT NOT NULL,
        node_count INTEGER NOT NULL,
        supports_batch BOOLEAN NOT NULL DEFAULT FALSE,
        last_executed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_desktop_workflow_org_updated
        ON desktop_workflow (organization_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS desktop_workflow_run (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL REFERENCES desktop_workflow (id) ON DELETE CASCADE,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_desktop_workflow_run_workflow_started
        ON desktop_workflow_run (workflow_id, started_at DESC);
    `,
  },
] as const;

export interface DesktopPgliteContext {
  databaseDirPath: string;
  db: PGlite;
  wasJustInitialized: boolean;
}

export class DesktopPgliteService {
  private context: DesktopPgliteContext | null = null;
  private contextPromise: Promise<DesktopPgliteContext> | null = null;
  private readonly databaseDirPath: string;
  private readonly wasJustInitialized: boolean;

  constructor() {
    const userDataPath = app.getPath('userData');
    fs.mkdirSync(userDataPath, { recursive: true });

    this.databaseDirPath = path.join(userDataPath, 'pglite-db');
    this.wasJustInitialized = !fs.existsSync(this.databaseDirPath);
    fs.mkdirSync(this.databaseDirPath, { recursive: true });
  }

  getDatabasePath(): string {
    return this.databaseDirPath;
  }

  async getContext(): Promise<DesktopPgliteContext> {
    if (this.context) {
      return this.context;
    }

    if (this.contextPromise) {
      return this.contextPromise;
    }

    this.contextPromise = (async () => {
      const db = new PGlite({
        dataDir: this.databaseDirPath,
        fs: new NodeFS(this.databaseDirPath),
        relaxedDurability: true,
      });

      await db.waitReady;
      await this.runMigrations(db);

      const context = {
        databaseDirPath: this.databaseDirPath,
        db,
        wasJustInitialized: this.wasJustInitialized,
      };

      this.context = context;
      return context;
    })();

    return this.contextPromise;
  }

  async close(): Promise<void> {
    if (!this.context) {
      return;
    }

    await this.context.db.close();
    this.context = null;
    this.contextPromise = null;
  }

  private async runMigrations(db: PGlite): Promise<void> {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS ${DESKTOP_SCHEMA_MIGRATION_TABLE} (
        version TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);

    const applied = await db.query<{ version: string }>(
      `SELECT version FROM ${DESKTOP_SCHEMA_MIGRATION_TABLE}`,
    );
    const appliedVersions = new Set(applied.rows.map((row) => row.version));

    for (const migration of DESKTOP_MIGRATIONS) {
      if (appliedVersions.has(migration.version)) {
        continue;
      }

      await db.exec(migration.sql);
      await db.query(
        `INSERT INTO ${DESKTOP_SCHEMA_MIGRATION_TABLE} (version, applied_at) VALUES ($1, $2)`,
        [migration.version, new Date().toISOString()],
      );
    }
  }
}
