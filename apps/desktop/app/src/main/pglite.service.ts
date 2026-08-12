import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { runDesktopPrismaMigrations } from '@genfeedai/desktop-prisma';

const DESKTOP_SCHEMA_BASELINE_VERSION = 1;

export class DesktopPgliteService {
  private instance: PGlite | null = null;
  private instancePromise: Promise<PGlite> | null = null;
  private resetUnsupportedDatabase = false;

  constructor(private readonly dataDir: string) {}

  getDataDir(): string {
    return this.dataDir;
  }

  didResetUnsupportedDatabase(): boolean {
    return this.resetUnsupportedDatabase;
  }

  private async hasSupportedBaseline(pglite: PGlite): Promise<boolean> {
    const existingTables = await pglite.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
    `);

    if (existingTables.rows.length === 0) {
      return true;
    }

    if (
      !existingTables.rows.some(
        (table) => table.table_name === 'desktop_schema_metadata',
      )
    ) {
      return false;
    }

    const baseline = await pglite.query<{ baseline_version: number }>(
      `SELECT baseline_version
       FROM desktop_schema_metadata
       WHERE singleton_key = 'current'`,
    );

    return (
      baseline.rows[0]?.baseline_version === DESKTOP_SCHEMA_BASELINE_VERSION
    );
  }

  private async openDatabase(): Promise<PGlite> {
    let pglite = new PGlite({ dataDir: this.dataDir });

    try {
      await pglite.waitReady;

      if (!(await this.hasSupportedBaseline(pglite))) {
        await pglite.close();
        await fs.rm(this.dataDir, { force: true, recursive: true });
        this.resetUnsupportedDatabase = true;
        pglite = new PGlite({ dataDir: this.dataDir });
        await pglite.waitReady;
      }

      await runDesktopPrismaMigrations(pglite);
      this.instance = pglite;
      return pglite;
    } catch (error) {
      await pglite.close().catch(() => undefined);
      throw error;
    }
  }

  async init(): Promise<PGlite> {
    if (this.instance) {
      return this.instance;
    }

    if (this.instancePromise) {
      return this.instancePromise;
    }

    this.instancePromise = this.openDatabase();

    try {
      return await this.instancePromise;
    } catch (error) {
      this.instancePromise = null;
      throw error;
    }
  }

  async close(): Promise<void> {
    const active = this.instance;
    this.instance = null;
    this.instancePromise = null;

    await active?.close();
  }
}
