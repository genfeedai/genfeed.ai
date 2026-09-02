import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EDITOR_RENDERER_VERSION } from '@genfeedai/contracts/interfaces';
import { VERSION as INSTALLED_REMOTION_VERSION } from 'remotion/version';

const specDirectory = path.dirname(fileURLToPath(import.meta.url));
const expectedRemotionVersion = EDITOR_RENDERER_VERSION.replace(
  'remotion@',
  '',
);

function resolveRepositoryRoot(): string {
  let directory = specDirectory;
  while (directory !== path.dirname(directory)) {
    if (existsSync(path.join(directory, 'bun.lock'))) {
      return directory;
    }
    directory = path.dirname(directory);
  }

  throw new Error(
    'Could not resolve the repository root from the Remotion version contract spec.',
  );
}

function readJsonRecord(filePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
}

function readStringMap(
  record: Record<string, unknown>,
  key: string,
): Record<string, string> {
  const value = record[key];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, string>;
}

describe('Remotion version contract', () => {
  const repositoryRoot = resolveRepositoryRoot();

  it('keeps the installed remotion version aligned with EDITOR_RENDERER_VERSION', () => {
    expect(INSTALLED_REMOTION_VERSION).toBe(expectedRemotionVersion);
  });

  it('keeps remotion workspace pins on the renderer contract version', () => {
    const filesDependencies = readStringMap(
      readJsonRecord(
        path.join(repositoryRoot, 'apps/server/files/package.json'),
      ),
      'dependencies',
    );
    const appDependencies = readStringMap(
      readJsonRecord(path.join(repositoryRoot, 'apps/app/package.json')),
      'dependencies',
    );

    expect(filesDependencies.remotion).toBe(expectedRemotionVersion);
    expect(filesDependencies['@remotion/bundler']).toBe(
      expectedRemotionVersion,
    );
    expect(filesDependencies['@remotion/renderer']).toBe(
      expectedRemotionVersion,
    );
    expect(appDependencies.remotion).toBe(expectedRemotionVersion);
    expect(appDependencies['@remotion/player']).toBe(expectedRemotionVersion);
  });

  it('does not leave a remotion patch pinned to a different version', () => {
    const patchedDependencies = readStringMap(
      readJsonRecord(path.join(repositoryRoot, 'package.json')),
      'patchedDependencies',
    );
    const remotionPatchKeys = Object.keys(patchedDependencies).filter((key) =>
      key.startsWith('@remotion/'),
    );

    for (const patchKey of remotionPatchKeys) {
      expect(patchKey.endsWith(`@${expectedRemotionVersion}`)).toBe(true);
    }
  });
});
