import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCheckConfigPackageBoundary } from './check-config-package-boundary';

const testDirs: string[] = [];

const PUBLIC_EXPORTS = {
  '.': {
    default: './dist/index.js',
    import: './dist/index.js',
    types: './dist/index.d.ts',
  },
  './license': {
    default: './dist/license.js',
    import: './dist/license.js',
    types: './dist/license.d.ts',
  },
  './license-server': {
    default: './dist/license-server.js',
    import: './dist/license-server.js',
    types: './dist/license-server.d.ts',
  },
};

const CONFIG_SOURCES = {
  'packages/config/src/index.ts': "export { isEEEnabled } from './license';",
  'packages/config/src/license-server.ts':
    "import { setLicenseVerificationVerdict } from './license-state';\nexport const verify = () => setLicenseVerificationVerdict(true);",
  'packages/config/src/license-state.ts':
    'export const getLicenseVerificationVerdict = () => false;',
  'packages/config/src/license.ts':
    "import { getLicenseVerificationVerdict } from './license-state';\nexport const isEEEnabled = () => getLicenseVerificationVerdict();",
};

afterEach(() => {
  for (const testDir of testDirs.splice(0)) {
    rmSync(testDir, { force: true, recursive: true });
  }
});

function fixture(
  files: Record<string, string>,
  manifest: Record<string, unknown> = { exports: PUBLIC_EXPORTS },
): string {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'config-package-boundary-'));
  testDirs.push(rootDir);

  const allFiles = {
    ...CONFIG_SOURCES,
    ...files,
    'packages/config/package.json': JSON.stringify({
      name: '@genfeedai/config',
      ...manifest,
    }),
  };

  for (const [file, source] of Object.entries(allFiles)) {
    const absolutePath = path.join(rootDir, file);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, source);
  }

  return rootDir;
}

describe('check-config-package-boundary', () => {
  it('accepts explicit public subpaths and owner-only internal imports', () => {
    const rootDir = fixture({
      'apps/app/src/example.ts':
        "import { isEEEnabled } from '@genfeedai/config/license';\nexport const enabled = isEEEnabled();",
    });

    expect(runCheckConfigPackageBoundary({ rootDir }).violations).toEqual([]);
  });

  it('flags a wildcard subpath export', () => {
    const rootDir = fixture(
      {},
      {
        exports: {
          ...PUBLIC_EXPORTS,
          './*': {
            default: './dist/*.js',
            import: './dist/*.js',
            types: './dist/*.d.ts',
          },
        },
      },
    );

    expect(runCheckConfigPackageBoundary({ rootDir }).violations).toEqual([
      expect.objectContaining({
        file: 'packages/config/package.json',
        specifier: './*',
      }),
    ]);
  });

  it('flags an explicit internal subpath in exports and typesVersions', () => {
    const rootDir = fixture(
      {},
      {
        exports: {
          ...PUBLIC_EXPORTS,
          './license-state': {
            default: './dist/license-state.js',
            import: './dist/license-state.js',
            types: './dist/license-state.d.ts',
          },
        },
        typesVersions: {
          '*': { 'license-state': ['dist/license-state.d.ts'] },
        },
      },
    );

    expect(runCheckConfigPackageBoundary({ rootDir }).violations).toEqual([
      expect.objectContaining({ specifier: './license-state' }),
      expect.objectContaining({ specifier: 'license-state' }),
    ]);
  });

  it('flags an export target without a source module', () => {
    const rootDir = fixture(
      {},
      {
        exports: {
          ...PUBLIC_EXPORTS,
          './pricing': {
            default: './dist/pricing.js',
            import: './dist/pricing.js',
            types: './dist/pricing.d.ts',
          },
        },
      },
    );

    expect(runCheckConfigPackageBoundary({ rootDir }).violations).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('packages/config/src/pricing.ts'),
        specifier: './pricing',
      }),
      expect.objectContaining({ specifier: './pricing' }),
      expect.objectContaining({ specifier: './pricing' }),
    ]);
  });

  it('flags every import shape that reaches internal license state', () => {
    const rootDir = fixture({
      'apps/app/src/package-subpath.ts':
        "import { getLicenseVerificationVerdict } from '@genfeedai/config/license-state';\nexport const verdict = getLicenseVerificationVerdict();",
      'packages/config/src/services/alias.ts':
        "export { getLicenseVerificationVerdict } from '@config/license-state';",
      'packages/ui/src/relative.ts':
        "const state = require('../../config/src/license-state');\nexport const dynamic = import('../../config/src/license-state.ts');\nexport { state };",
    });

    expect(
      runCheckConfigPackageBoundary({ rootDir }).violations.map(
        (violation) => violation.file,
      ),
    ).toEqual([
      'apps/app/src/package-subpath.ts',
      'packages/config/src/services/alias.ts',
      'packages/ui/src/relative.ts',
      'packages/ui/src/relative.ts',
    ]);
  });
});
