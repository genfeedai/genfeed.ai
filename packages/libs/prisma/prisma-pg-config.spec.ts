import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createPrismaPgConfig } from './prisma-pg-config';

let tempDirectories: string[] = [];

const defaultPool = {
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 300_000,
  keepAlive: true,
  max: 10,
  maxLifetimeSeconds: 1_800,
  min: 2,
} as const;

function pgUrl(host: string, query = ''): string {
  return [
    'postgresql',
    '://',
    'genfeed',
    ':',
    'genfeed_local',
    '@',
    host,
    ':5432/genfeed',
    query,
  ].join('');
}

function writeCaFile(contents = 'test-rds-ca'): string {
  const directory = mkdtempSync(join(tmpdir(), 'genfeed-prisma-ca-'));
  tempDirectories.push(directory);
  const caFile = join(directory, 'rds-ca.pem');
  writeFileSync(caFile, contents);
  return caFile;
}

afterEach(() => {
  for (const directory of tempDirectories) {
    rmSync(directory, { force: true, recursive: true });
  }
  tempDirectories = [];
});

describe('createPrismaPgConfig', () => {
  it('lets sslmode=disable win over CA env configuration and strips sslmode', () => {
    const connectionString = pgUrl('postgres', '?sslmode=disable');

    expect(
      createPrismaPgConfig(connectionString, {
        caFilePaths: [writeCaFile()],
      }),
    ).toEqual({
      connectionString: pgUrl('postgres'),
      ssl: false,
      ...defaultPool,
    });
  });

  it('maps sslmode=require to encrypted TLS without chain verification', () => {
    const connectionString = pgUrl('db.example.com', '?sslmode=require');

    expect(createPrismaPgConfig(connectionString)).toEqual({
      connectionString: pgUrl('db.example.com'),
      ssl: { rejectUnauthorized: false },
      ...defaultPool,
    });
  });

  it('resolves Prisma pool params into pg pool config and strips them', () => {
    const connectionString = pgUrl(
      'db.example.com',
      '?schema=public&sslmode=no-verify&connection_limit=5&pool_timeout=20',
    );

    expect(createPrismaPgConfig(connectionString)).toEqual({
      connectionString: pgUrl('db.example.com', '?schema=public'),
      ssl: { rejectUnauthorized: false },
      ...defaultPool,
      connectionTimeoutMillis: 20_000,
      max: 5,
    });
  });

  it('ignores malformed pool params and keeps defaults', () => {
    const connectionString = pgUrl(
      'db.example.com',
      '?connection_limit=zero&pool_timeout=-5',
    );

    expect(createPrismaPgConfig(connectionString)).toEqual({
      connectionString: pgUrl('db.example.com'),
      ...defaultPool,
    });
  });

  it('falls back to the standard PGSSLROOTCERT env var', () => {
    const connectionString = pgUrl('db.example.com');

    expect(
      createPrismaPgConfig(connectionString, {
        caFilePaths: [undefined, writeCaFile('pg-ca')],
      }),
    ).toEqual({
      connectionString,
      ssl: { ca: 'pg-ca', rejectUnauthorized: true },
      ...defaultPool,
    });
  });

  it('fails fast when an explicit CA file path is missing', () => {
    const missingCaFile = join(tmpdir(), 'missing-genfeed-rds-ca.pem');

    expect(() =>
      createPrismaPgConfig(pgUrl('db.example.com'), {
        caFilePaths: [missingCaFile],
      }),
    ).toThrow(/Postgres CA file does not exist/);
  });

  it('requires a CA file for verify-full mode', () => {
    expect(() =>
      createPrismaPgConfig(pgUrl('db.example.com', '?sslmode=verify-full')),
    ).toThrow(/Postgres SSL verification requires a CA file/);
  });
});
