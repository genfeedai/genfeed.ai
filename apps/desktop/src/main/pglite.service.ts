import fs from 'node:fs/promises';
import type { PGlite } from '@electric-sql/pglite';
import { runDesktopPrismaMigrations } from '@genfeedai/desktop-prisma';
import { bootPGlite } from './pglite-boot.util';

const DESKTOP_SCHEMA_BASELINE_VERSION = 1;
type DesktopSchemaBaselineState = 'newer' | 'supported' | 'unsupported';

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

  private async readBaselineState(
    pglite: PGlite,
  ): Promise<DesktopSchemaBaselineState> {
    const existingTables = await pglite.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
    `);

    if (existingTables.rows.length === 0) {
      return 'supported';
    }

    if (
      !existingTables.rows.some(
        (table) => table.table_name === 'desktop_schema_metadata',
      )
    ) {
      return 'unsupported';
    }

    const baseline = await pglite.query<{ baseline_version: number }>(
      `SELECT baseline_version
       FROM desktop_schema_metadata
       WHERE singleton_key = 'current'`,
    );

    const version = baseline.rows[0]?.baseline_version;

    if (version === undefined) {
      return 'unsupported';
    }

    if (version > DESKTOP_SCHEMA_BASELINE_VERSION) {
      return 'newer';
    }

    return version === DESKTOP_SCHEMA_BASELINE_VERSION
      ? 'supported'
      : 'unsupported';
  }

  private async openDatabase(): Promise<PGlite> {
    let pglite = await bootPGlite({ dataDir: this.dataDir });

    try {
      const baselineState = await this.readBaselineState(pglite);

      if (baselineState === 'newer') {
        throw new Error(
          'The local database was created by a newer version of Genfeed Desktop. Update the app to open it.',
        );
      }

      if (baselineState === 'unsupported') {
        await pglite.close();
        await fs.rm(this.dataDir, { force: true, recursive: true });
        this.resetUnsupportedDatabase = true;
        pglite = await bootPGlite({ dataDir: this.dataDir });
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
