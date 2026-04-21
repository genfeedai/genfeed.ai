import type { PrismaClient } from '@genfeedai/desktop-prisma';
import { createDesktopPrismaClient } from '@genfeedai/desktop-prisma';
import { DesktopPgliteService } from './pglite.service';

export class DesktopPrismaService {
  private client: PrismaClient | null = null;
  private clientPromise: Promise<PrismaClient> | null = null;

  constructor(
    private readonly pgliteService: DesktopPgliteService = new DesktopPgliteService(),
  ) {}

  getDatabasePath(): string {
    return this.pgliteService.getDatabasePath();
  }

  async getClient(): Promise<PrismaClient> {
    if (this.client) {
      return this.client;
    }

    if (this.clientPromise) {
      return this.clientPromise;
    }

    this.clientPromise = (async () => {
      const context = await this.pgliteService.getContext();
      const client = createDesktopPrismaClient(context.db, {
        databaseDirPath: context.databaseDirPath,
        log:
          process.env.NODE_ENV === 'development'
            ? ['query', 'error', 'warn']
            : ['error'],
        wasJustInitialized: context.wasJustInitialized,
      });

      this.client = client;
      return client;
    })();

    return this.clientPromise;
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.$disconnect();
      this.client = null;
    }

    this.clientPromise = null;
    await this.pgliteService.close();
  }
}
