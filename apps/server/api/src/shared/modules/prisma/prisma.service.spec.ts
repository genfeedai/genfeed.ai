import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createPrismaPgConfig } from './prisma.service';

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
    const connectionString = pgUrl('postgres', '?sslmode=disable');

    expect(
      createPrismaPgConfig(connectionString, {
        caFilePaths: [writeCaFile()],
      }),
    ).toEqual({ connectionString });
  });

  it('maps sslmode=no-verify to encrypted TLS without chain verification', () => {
    const connectionString = pgUrl('db.example.com', '?sslmode=no-verify');

    // sslmode is resolved into the explicit ssl object and stripped from the
    // URL so pg never re-parses it (no deprecation warning, pg-upgrade safe).
    expect(createPrismaPgConfig(connectionString)).toEqual({
      connectionString: pgUrl('db.example.com'),
      ssl: { rejectUnauthorized: false },
    });
  });

  it('maps sslmode=require to encrypted TLS without chain verification', () => {
    const connectionString = pgUrl('db.example.com', '?sslmode=require');

    expect(createPrismaPgConfig(connectionString)).toEqual({
      connectionString: pgUrl('db.example.com'),
      ssl: { rejectUnauthorized: false },
    });
  });

  it('lets an available CA win over sslmode=require and strips the param', () => {
    const connectionString = pgUrl('db.example.com', '?sslmode=require');

    expect(
      createPrismaPgConfig(connectionString, {
        caFilePaths: [writeCaFile('require-ca')],
      }),
    ).toEqual({
      connectionString: pgUrl('db.example.com'),
      ssl: { ca: 'require-ca', rejectUnauthorized: true },
    });
  });

  it('preserves other query params when stripping sslmode', () => {
    const connectionString = pgUrl(
      'db.example.com',
      '?schema=public&sslmode=no-verify&connection_limit=5',
    );

    expect(createPrismaPgConfig(connectionString)).toEqual({
      connectionString: pgUrl(
        'db.example.com',
        '?schema=public&connection_limit=5',
      ),
      ssl: { rejectUnauthorized: false },
    });
  });

  it('passes an explicit Prisma Postgres CA file to the adapter', () => {
    const connectionString = pgUrl(
      'genfeed-data.cjo0gec08b5r.us-west-1.rds.amazonaws.com',
    );

    expect(
      createPrismaPgConfig(connectionString, {
        caFilePaths: [writeCaFile('explicit-ca')],
      }),
    ).toEqual({
      connectionString,
      ssl: { ca: 'explicit-ca', rejectUnauthorized: true },
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
