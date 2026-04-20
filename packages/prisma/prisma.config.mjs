// @ts-check
// Using .mjs to avoid TypeScript compilation issues during `prisma generate`
// (Prisma's TS loader doesn't resolve workspace tsconfig extensions).
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: './prisma/schema.prisma',
  migrations: {
    path: './prisma/migrations',
  },
  datasource: {
    // No env() here — prisma generate doesn't need a real URL.
    // Migrations (prisma migrate dev) are always run manually with DATABASE_URL set.
    url: process.env.DATABASE_URL ?? '',
  },
});
