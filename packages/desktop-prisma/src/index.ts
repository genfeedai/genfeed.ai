import type { PGlite } from '@electric-sql/pglite';
import { PrismaPGliteAdapterFactory } from 'prisma-pglite/dist/adapter/prisma-pglite-adapter/pglite.js';
import { PrismaClient } from '../generated/desktop-prisma/client/client';

export type * from '../generated/desktop-prisma/client/client';
export { PrismaClient } from '../generated/desktop-prisma/client/client';

export interface CreateDesktopPrismaClientOptions {
  databaseDirPath: string;
  log?: Array<'error' | 'query' | 'warn'>;
  wasJustInitialized?: boolean;
}

class DesktopPrismaPgliteAdapter extends PrismaPGliteAdapterFactory {
  readonly databaseDirPath: string;
  readonly wasJustInitialized: boolean;

  constructor(pglite: PGlite, options: CreateDesktopPrismaClientOptions) {
    super(pglite);
    this.databaseDirPath = options.databaseDirPath;
    this.wasJustInitialized = options.wasJustInitialized ?? false;
  }
}

export function createDesktopPrismaClient(
  pglite: PGlite,
  options: CreateDesktopPrismaClientOptions,
): PrismaClient {
  return new PrismaClient({
    adapter: new DesktopPrismaPgliteAdapter(pglite, options),
    log: options.log ?? ['error'],
  });
}
