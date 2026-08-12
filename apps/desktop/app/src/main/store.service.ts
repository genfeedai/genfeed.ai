import fs from 'node:fs';
import path from 'node:path';

export interface DesktopKeyValueStore {
  deleteValue(key: string): Promise<void>;
  getValue(key: string): Promise<string | null>;
  getValueSync(key: string): string | null;
  setValue(key: string, value: string): Promise<void>;
  setValueSync(key: string, value: string): void;
}

type StoredValues = Record<string, string>;

function parseStoredValues(raw: string): StoredValues {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  } catch {
    return {};
  }
}

/**
 * Small process-local preference store for state that must exist before the
 * optional PGlite runtime. Values remain encrypted by their owning service
 * (for example DesktopSessionService uses Electron safeStorage).
 */
export class DesktopStoreService implements DesktopKeyValueStore {
  private values: StoredValues | null = null;

  constructor(private readonly filePath: string) {}

  getPath(): string {
    return this.filePath;
  }

  private load(): StoredValues {
    if (this.values) {
      return this.values;
    }

    try {
      this.values = parseStoredValues(fs.readFileSync(this.filePath, 'utf8'));
    } catch {
      this.values = {};
    }

    return this.values;
  }

  private persist(): void {
    const directory = path.dirname(this.filePath);
    const temporaryPath = `${this.filePath}.${String(process.pid)}.tmp`;
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(temporaryPath, JSON.stringify(this.load(), null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
    fs.renameSync(temporaryPath, this.filePath);
    fs.chmodSync(this.filePath, 0o600);
  }

  getValueSync(key: string): string | null {
    return this.load()[key] ?? null;
  }

  async getValue(key: string): Promise<string | null> {
    return this.getValueSync(key);
  }

  setValueSync(key: string, value: string): void {
    this.load()[key] = value;
    this.persist();
  }

  async setValue(key: string, value: string): Promise<void> {
    this.setValueSync(key, value);
  }

  async deleteValue(key: string): Promise<void> {
    const values = this.load();
    if (!(key in values)) {
      return;
    }

    delete values[key];
    this.persist();
  }
}
