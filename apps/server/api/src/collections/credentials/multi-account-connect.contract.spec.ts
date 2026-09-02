import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const API_SRC = path.resolve(SPEC_DIR, '../..');
const INTEGRATIONS_DIRS = [path.join(API_SRC, 'services/integrations')];
const CREDENTIALS_SERVICE_PATH = path.join(
  API_SRC,
  'collections/credentials/services/credentials.service.ts',
);

/** Every integration source file, so a new platform is covered the day it lands. */
function collectIntegrationSources(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const entryPath = path.join(directory, entry);

    if (statSync(entryPath).isDirectory()) {
      return collectIntegrationSources(entryPath);
    }

    if (!entryPath.endsWith('.ts') || entryPath.endsWith('.spec.ts')) {
      return [];
    }

    return [entryPath];
  });
}

const INTEGRATION_SOURCES = INTEGRATIONS_DIRS.flatMap((directory) =>
  collectIntegrationSources(directory),
).map(
  (filePath) =>
    [path.relative(API_SRC, filePath), readFileSync(filePath, 'utf8')] as const,
);

/**
 * A credential payload is one handed to a persistence call. Reading
 * `credential.externalId` is fine; writing `externalId:` into a create or patch
 * is the multi-account bug, because it settles account identity outside the one
 * place that knows what the brand already holds.
 */
const CREDENTIAL_IDENTITY_WRITE =
  /credentialsService\s*\.\s*(?:create|patch|update|updateMany)\s*\([^;]*?\bexternalId:/s;

describe('multi-account connect contract', () => {
  it('covers every integration', () => {
    expect(INTEGRATION_SOURCES.length).toBeGreaterThan(100);
  });

  it('leaves no integration calling a removed single-account helper', () => {
    const offenders = INTEGRATION_SOURCES.filter(
      ([, source]) =>
        source.includes('upsertForBrand') ||
        source.includes('getOrCreateCredential'),
    ).map(([file]) => file);

    expect(offenders).toEqual([]);
  });

  it('leaves no integration writing credential identity outside reconciliation', () => {
    const offenders = INTEGRATION_SOURCES.filter(([, source]) =>
      CREDENTIAL_IDENTITY_WRITE.test(source),
    ).map(([file]) => file);

    expect(offenders).toEqual([]);
  });

  it('routes every identity write through the reconciling chokepoint', () => {
    const service = readFileSync(CREDENTIALS_SERVICE_PATH, 'utf8');

    expect(service).toContain('async connectAccount(');
    expect(service).toContain('async createPendingForBrand(');
    expect(service).toContain('private async reconcileConnectedAccount(');
    expect(service).not.toContain('async upsertForBrand(');
    expect(service).toContain(
      'return this.reconcileConnectedAccount(credential, externalId, update)',
    );
  });

  it('provisions a fresh unidentified credential at connect time', () => {
    const service = readFileSync(CREDENTIALS_SERVICE_PATH, 'utf8');
    const createPending = service.slice(
      service.indexOf('async createPendingForBrand('),
      service.indexOf('private async reapStalePendingCredentials('),
    );

    expect(createPending).toContain('externalId: null');
    expect(createPending).toContain('isConnected: false');
    expect(createPending).toContain('this.reapStalePendingCredentials(');
    expect(createPending).not.toContain('findOne(');
  });

  it('treats a unique-index collision as a lost race rather than a failure', () => {
    const service = readFileSync(CREDENTIALS_SERVICE_PATH, 'utf8');

    expect(service).toContain('isUniqueConstraintViolation(error)');
    expect(service).toContain("=== 'P2002'");
    expect(service).toContain('this.prisma.$transaction');
  });

  it('refuses to persist an account the provider never identified', () => {
    const service = readFileSync(CREDENTIALS_SERVICE_PATH, 'utf8');

    expect(service).toContain('ValidationException');
    expect(service).toMatch(/did not identify which account was authorized/);
  });

  it('keeps the shared integration base on the reconciling path', () => {
    const base = readFileSync(
      path.join(
        API_SRC,
        'shared/controllers/base-integration/base-integration.controller.ts',
      ),
      'utf8',
    );

    expect(base).toContain('createPendingForBrand');
    expect(base).toContain('connectAccount(');
    expect(base).not.toContain('getOrCreateCredential');
    expect(base).not.toMatch(CREDENTIAL_IDENTITY_WRITE);
  });
});
