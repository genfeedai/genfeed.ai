// @ts-check
// Using .mjs to avoid TypeScript compilation issues during `prisma generate`
// (Prisma's TS loader doesn't resolve workspace tsconfig extensions).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';

function databaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const envLocal = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../.env.local',
  );
  if (!existsSync(envLocal)) {
    return '';
  }

  for (const line of readFileSync(envLocal, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('DATABASE_URL=')) {
      return trimmed.slice('DATABASE_URL='.length).replace(/^['"]|['"]$/g, '');
    }
  }

  return '';
}

export default defineConfig({
  schema: './prisma/schema.prisma',
  migrations: {
    path: './prisma/migrations',
  },
  datasource: {
    // prisma generate can run with an empty URL. migrate/db need a real one.
    // Prisma 7 does not load repo-root .env.local unless we do it here.
    url: databaseUrl(),
  },
});
