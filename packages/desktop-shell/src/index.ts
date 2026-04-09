import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

interface ShellWindowLike {
  focus(): void;
  isVisible(): boolean;
  show(): void;
}

interface ShellShortcut {
  accelerator: string;
  callback: (window: ShellWindowLike) => void;
}

interface ShellTelemetryConfig {
  appName: string;
  appVersion: string;
  sentryDsn?: string;
  sentryEnvironment?: string;
  sentryRelease?: string;
}

interface ShellTelemetryUser {
  email?: string;
  id: string;
  name?: string;
}

interface ShellTrayMenuItem {
  click?: () => void;
  enabled?: boolean;
  label: string;
  type?: 'separator';
}

interface ShellTrayOptions {
  appName: string;
  contextMenuItems: ShellTrayMenuItem[];
  iconPath: string;
  tooltip: string;
}

interface ShellMenuItem {
  accelerator?: string;
  click: () => void;
  label: string;
}

interface ShellMenuOptions {
  fileItems?: ShellMenuItem[];
  viewItems?: ShellMenuItem[];
}

const ensureDataDirectory = (appName: string): string => {
  const baseDir = process.env.GENFEED_DESKTOP_DATA_DIR
    ? path.resolve(process.env.GENFEED_DESKTOP_DATA_DIR)
    : path.join(process.cwd(), '.data');

  const appDir = path.join(baseDir, appName);
  fs.mkdirSync(appDir, { recursive: true });
  return appDir;
};

type SqliteDatabase = InstanceType<typeof Database>;

export class ShellDatabaseService {
  private readonly db: SqliteDatabase;

  constructor(appName: string, migrations = '') {
    const appDir = ensureDataDirectory(appName);
    this.db = new Database(path.join(appDir, `${appName}.sqlite`));
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
}

export class ShellTelemetryService {
  constructor(private readonly _config: ShellTelemetryConfig) {}

  init(): void {}

  setUser(_user: ShellTelemetryUser | null): void {}

  captureException(_error: unknown, _context?: Record<string, unknown>): void {}
}

export class ShellTrayService {
  initialize(_window: ShellWindowLike, _options: ShellTrayOptions): void {}

  destroy(): void {}
}

export class ShellShortcutsService {
  register(_window: ShellWindowLike, _shortcuts: ShellShortcut[]): void {}

  unregister(): void {}
}

export const buildShellMenu = (
  _window: ShellWindowLike,
  _options: ShellMenuOptions,
): void => {};
