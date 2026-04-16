import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const ensureDataDirectory = (appName: string): string => {
  const baseDir = process.env.GENFEED_DESKTOP_DATA_DIR
    ? path.resolve(process.env.GENFEED_DESKTOP_DATA_DIR)
    : path.join(process.cwd(), '.data');

  const appDir = path.join(baseDir, appName);
  fs.mkdirSync(appDir, { recursive: true });
  return appDir;
};

export function buildShellDatabasePath(appName: string): string {
  return path.join(ensureDataDirectory(appName), `${appName}.sqlite`);
}

type SqliteDatabase = InstanceType<typeof Database>;

export class ShellDatabaseService {
  private readonly db: SqliteDatabase;
  private readonly dbPath: string;

  constructor(appName: string, migrations = '') {
    this.dbPath = buildShellDatabasePath(appName);
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    if (migrations.trim().length > 0) {
      this.db.exec(migrations);
    }
  }

  protected getDb(): SqliteDatabase {
    return this.db;
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

  getDatabasePath(): string {
    return this.dbPath;
  }
}
