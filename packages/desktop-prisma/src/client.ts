import type { PGlite } from '@electric-sql/pglite';
import { PrismaPGliteAdapterFactory } from 'prisma-pglite/dist/adapter/prisma-pglite-adapter/pglite.js';
import { PrismaClient } from '../generated/desktop-prisma/client/client';

export function createDesktopPrismaClient(pglite: PGlite): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPGliteAdapterFactory(pglite),
  });
}
