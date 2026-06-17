import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';
import { createPrismaPgConfig } from './prisma.service';

const CA_ENV_KEYS = ['PRISMA_POSTGRES_CA_FILE', 'PGSSLROOTCERT'] as const;
const originalEnv = Object.fromEntries(
  CA_ENV_KEYS.map((key) => [key, process.env[key]]),
);
let tempDirectories: string[] = [];

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
  for (const key of CA_ENV_KEYS) {
    const originalValue = originalEnv[key];
    if (originalValue === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalValue;
    }
  }

  for (const directory of tempDirectories) {
    rmSync(directory, { force: true, recursive: true });
  }
  tempDirectories = [];
});

describe('createPrismaPgConfig', () => {
  it('leaves ordinary local Postgres URLs unchanged', () => {
    const connectionString = pgUrl('localhost');

    expect(createPrismaPgConfig(connectionString)).toEqual({
      connectionString,
    });
  });

  it('lets sslmode=disable win over CA env configuration', () => {
    process.env.PRISMA_POSTGRES_CA_FILE = writeCaFile();
    const connectionString = pgUrl('postgres', '?sslmode=disable');

    expect(createPrismaPgConfig(connectionString)).toEqual({
      connectionString,
    });
  });

  it('maps sslmode=no-verify to encrypted TLS without chain verification', () => {
    const connectionString = pgUrl('db.example.com', '?sslmode=no-verify');

    expect(createPrismaPgConfig(connectionString)).toEqual({
      connectionString,
      ssl: { rejectUnauthorized: false },
    });
  });

  it('passes an explicit Prisma Postgres CA file to the adapter', () => {
    process.env.PRISMA_POSTGRES_CA_FILE = writeCaFile('explicit-ca');
    const connectionString = pgUrl(
      'genfeed-data.cjo0gec08b5r.us-west-1.rds.amazonaws.com',
    );

    expect(createPrismaPgConfig(connectionString)).toEqual({
      connectionString,
      ssl: { ca: 'explicit-ca', rejectUnauthorized: true },
    });
  });

  it('falls back to the standard PGSSLROOTCERT env var', () => {
    process.env.PGSSLROOTCERT = writeCaFile('pg-ca');
    const connectionString = pgUrl('db.example.com');

    expect(createPrismaPgConfig(connectionString)).toEqual({
      connectionString,
      ssl: { ca: 'pg-ca', rejectUnauthorized: true },
    });
  });

  it('fails fast when an explicit CA file path is missing', () => {
    process.env.PRISMA_POSTGRES_CA_FILE = join(
      tmpdir(),
      'missing-genfeed-rds-ca.pem',
    );

    expect(() => createPrismaPgConfig(pgUrl('db.example.com'))).toThrow(
      /Postgres CA file does not exist/,
    );
  });

  it('requires a CA file for verify-full mode', () => {
    expect(() =>
      createPrismaPgConfig(pgUrl('db.example.com', '?sslmode=verify-full')),
    ).toThrow(/Postgres SSL verification requires a CA file/);
  });
});
