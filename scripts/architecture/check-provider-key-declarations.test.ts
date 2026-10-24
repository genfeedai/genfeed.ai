import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  isProviderCredentialKey,
  runCheckProviderKeyDeclarations,
} from './check-provider-key-declarations';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const testDirs: string[] = [];

afterEach(() => {
  for (const testDir of testDirs.splice(0)) {
    rmSync(testDir, { force: true, recursive: true });
  }
});

const DECLARED_FILES = {
  '.env.example': '# OPTIONAL: Acme\nACME_API_KEY=\n',
  'packages/config/src/interfaces/env-config.interface.ts':
    '  ACME_API_KEY?: string;\n',
  'packages/config/src/schemas/ai.schema.ts':
    "  ACME_API_KEY: Joi.string().optional().allow(''),\n",
  'scripts/env-spec.ts': "const keys = ['ACME_API_KEY'];\n",
};

function createRepo(files: Record<string, string>): string {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'provider-key-decl-'));
  testDirs.push(rootDir);
  for (const [file, source] of Object.entries({
    ...DECLARED_FILES,
    ...files,
  })) {
    const absolute = path.join(rootDir, file);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, source);
  }
  return rootDir;
}

const SERVICE = 'apps/server/api/src/acme.service.ts';

describe('isProviderCredentialKey', () => {
  it.each([
    'ACME_API_KEY',
    'REPLICATE_KEY',
    'KLINGAI_SECRET',
    'APIFY_API_TOKEN',
  ])('matches %s', (key) => {
    expect(isProviderCredentialKey(key)).toBe(true);
  });

  it.each([
    'STRIPE_SECRET_KEY',
    'TOKEN_ENCRYPTION_KEY',
    'ACME_ENABLED',
    'REDIS_URL',
    'ACME_WEBHOOK_SECRET',
  ])('ignores %s', (key) => {
    expect(isProviderCredentialKey(key)).toBe(false);
  });
});

describe('runCheckProviderKeyDeclarations', () => {
  it('passes the current repository', () => {
    const result = runCheckProviderKeyDeclarations({
      rootDir: repositoryRoot,
    });

    expect(result.scannedFileCount).toBeGreaterThan(0);
    expect(result.violations).toEqual([]);
    expect(result.staleLegacyKeys).toEqual([]);
  });

  it('accepts a key declared in all four places', () => {
    const rootDir = createRepo({
      [SERVICE]: "const key = this.config.get<string>('ACME_API_KEY');\n",
    });

    expect(runCheckProviderKeyDeclarations({ rootDir }).violations).toEqual([]);
  });

  it('reports every place an undeclared key is missing from', () => {
    const rootDir = createRepo({
      [SERVICE]: "const key = this.config.get('BETA_API_KEY');\n",
    });

    expect(runCheckProviderKeyDeclarations({ rootDir }).violations).toEqual([
      {
        file: SERVICE,
        key: 'BETA_API_KEY',
        line: 1,
        missing: ['env-spec', 'env-template', 'joi-schema', 'typing'],
      },
    ]);
  });

  it('catches a raw process.env read', () => {
    const rootDir = createRepo({
      [SERVICE]: 'const key = process.env.BETA_KEY;\n',
    });

    expect(
      runCheckProviderKeyDeclarations({ rootDir }).violations.map(
        (violation) => violation.key,
      ),
    ).toEqual(['BETA_KEY']);
  });

  it('reports a partly declared key once with only the missing places', () => {
    const rootDir = createRepo({
      '.env.example': '',
      [SERVICE]:
        "const a = this.config.get('ACME_API_KEY');\nconst b = this.config.get('ACME_API_KEY');\n",
    });

    expect(runCheckProviderKeyDeclarations({ rootDir }).violations).toEqual([
      {
        file: SERVICE,
        key: 'ACME_API_KEY',
        line: 1,
        missing: ['env-template'],
      },
    ]);
  });

  it('ignores spec files and non-credential keys', () => {
    const rootDir = createRepo({
      'apps/server/api/src/acme.service.spec.ts':
        "config.get('GHOST_API_KEY');\n",
      [SERVICE]: "const url = this.config.get('GHOST_URL');\n",
    });

    expect(runCheckProviderKeyDeclarations({ rootDir }).violations).toEqual([]);
  });

  it('tolerates a legacy key but fails once it is declared', () => {
    const undeclared = createRepo({
      [SERVICE]: "const key = this.config.get('BETA_API_KEY');\n",
    });
    const legacyKeys = new Set(['BETA_API_KEY']);

    expect(
      runCheckProviderKeyDeclarations({ legacyKeys, rootDir: undeclared }),
    ).toMatchObject({ staleLegacyKeys: [], violations: [] });

    const declared = createRepo({
      [SERVICE]: "const key = this.config.get('ACME_API_KEY');\n",
    });

    expect(
      runCheckProviderKeyDeclarations({
        legacyKeys: new Set(['ACME_API_KEY']),
        rootDir: declared,
      }).staleLegacyKeys,
    ).toEqual(['ACME_API_KEY']);
  });
});
