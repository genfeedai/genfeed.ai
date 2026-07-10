import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkDeploymentModeBoundary } from './check-deployment-mode-boundary';

const testDirs: string[] = [];

afterEach(() => {
  for (const testDir of testDirs.splice(0)) {
    rmSync(testDir, { force: true, recursive: true });
  }
});

function fixture(files: Record<string, string>): string {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'deployment-boundary-'));
  testDirs.push(rootDir);

  for (const [file, source] of Object.entries(files)) {
    const absolutePath = path.join(rootDir, file);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, source);
  }

  return rootDir;
}

describe('deployment mode boundary', () => {
  it('accepts canonical mode consumers', () => {
    const rootDir = fixture({
      'apps/app/src/example.ts':
        "import { isSaaS } from '@genfeedai/config/deployment';\nexport const enabled = isSaaS();",
    });

    expect(checkDeploymentModeBoundary({ rootDir })).toEqual([]);
  });

  it('rejects raw mode env reads and legacy APIs', () => {
    const rootDir = fixture({
      'apps/app/src/example.ts':
        'export const mode = process.env.NEXT_PUBLIC_GENFEED_CLOUD || process.env.BETTER_AUTH_ENABLED || process.env.GENFEED_LICENSE_KEY || IS_CLOUD_MODE;',
    });

    expect(checkDeploymentModeBoundary({ rootDir })).toEqual([
      expect.objectContaining({ reason: 'legacy-mode-api' }),
      expect.objectContaining({ reason: 'raw-auth-env' }),
      expect.objectContaining({ reason: 'raw-license-env' }),
      expect.objectContaining({ reason: 'raw-mode-env' }),
    ]);
  });

  it('allows raw env access only in the canonical module and Next config', () => {
    const rootDir = fixture({
      'apps/app/next.config.ts':
        'export const cloud = process.env.GENFEED_CLOUD;',
      'packages/config/src/deployment.ts':
        'export const desktop = process.env.NEXT_PUBLIC_DESKTOP_SHELL;',
      'packages/config/src/license.ts':
        'export const license = process.env.GENFEED_LICENSE_KEY;',
      'packages/auth-client/src/config.ts':
        'export const auth = process.env.BETTER_AUTH_ENABLED;',
    });

    expect(checkDeploymentModeBoundary({ rootDir })).toEqual([]);
  });
});
