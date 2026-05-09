import { PGlite } from '@electric-sql/pglite';
import { runDesktopPrismaMigrations } from '@genfeedai/desktop-prisma';

export class DesktopPgliteService {
  private instance: PGlite | null = null;
  private instancePromise: Promise<PGlite> | null = null;

  constructor(private readonly dataDir: string) {}

  getDataDir(): string {
    return this.dataDir;
  }

  async init(): Promise<PGlite> {
    if (this.instance) {
      return this.instance;
    }

    if (this.instancePromise) {
      return this.instancePromise;
    }

    this.instancePromise = (async () => {
      const pglite = new PGlite({
        dataDir: this.dataDir,
      });

      await pglite.waitReady;
      await runDesktopPrismaMigrations(pglite);
      this.instance = pglite;
      return pglite;
    })();

    return this.instancePromise;
  }

  async close(): Promise<void> {
    const active = this.instance;
    this.instance = null;
    this.instancePromise = null;

    await active?.close();
  }
}
