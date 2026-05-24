export type * from '../generated/desktop-prisma/client/client';
export {
  Prisma,
  PrismaClient,
} from '../generated/desktop-prisma/client/client';
export { createDesktopPrismaClient } from './client';
export { runDesktopPrismaMigrations } from './migrations';
