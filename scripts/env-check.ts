import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { DEPRECATED_ENV_KEYS, ENV_TARGETS } from './env-spec';

const rootDir = process.cwd();

function listTrackedFiles(): string[] | null {
  try {
    return execFileSync('git', ['ls-files'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    })
      .split('\n')
      .filter(Boolean);
  } catch (error) {
    if (process.env.VERCEL === '1') {
      return null;
    }

    throw error;
  }
}

function listTrackedEnvFiles(trackedFiles: string[]): string[] {
  return trackedFiles
    .filter((filePath) => /(^|\/)\.env(\..*)?$/.test(filePath))
    .filter((filePath) => !filePath.endsWith('.env.example'));
}

function listTrackedEnvTemplates(trackedFiles: string[]): string[] {
  return trackedFiles.filter((filePath) => filePath.endsWith('.env.example'));
}

function collectEnvFiles(envTemplates: string[]): string[] {
  // Every committed template is scanned, not just the root one: a retired key
  // left in `docker/.env.example` ships inside the self-hosted release bundle.
  const files = new Set<string>([
    ...envTemplates,
    '.env.local',
    '.env.staging',
    '.env.production',
  ]);

  for (const target of ENV_TARGETS) {
    files.add(target.generatedFileByMode.local);
    files.add(target.generatedFileByMode.staging);
    files.add(target.generatedFileByMode.production);

    if (target.localLegacyFile) {
      files.add(target.localLegacyFile);
    }
  }

  return [...files].filter((filePath) =>
    fs.existsSync(path.join(rootDir, filePath)),
  );
}

function findDeprecatedKeys(files: string[]): string[] {
  const findings: string[] = [];

  for (const filePath of files) {
    const content = fs.readFileSync(path.join(rootDir, filePath), 'utf8');

    for (const deprecatedKey of DEPRECATED_ENV_KEYS) {
      if (new RegExp(`^${deprecatedKey}=`, 'm').test(content)) {
        findings.push(`${filePath}: ${deprecatedKey}`);
      }
    }
  }

  return findings;
}

function main() {
  const trackedFiles = listTrackedFiles();

  if (trackedFiles === null) {
    console.warn('Skipping tracked env file check outside a git worktree.');
  }

  // Outside a worktree only the root template is discoverable, but the
  // deprecated-key scan still runs against it.
  const trackedEnvFiles = trackedFiles ? listTrackedEnvFiles(trackedFiles) : [];
  const envTemplates = trackedFiles
    ? listTrackedEnvTemplates(trackedFiles)
    : ['.env.example'];
  const deprecatedKeys = findDeprecatedKeys(collectEnvFiles(envTemplates));
  const failures: string[] = [];

  if (trackedEnvFiles.length > 0) {
    failures.push(
      `Tracked real env files are not allowed:\n${trackedEnvFiles
        .map((filePath) => `- ${filePath}`)
        .join('\n')}`,
    );
  }

  if (deprecatedKeys.length > 0) {
    failures.push(
      `Deprecated env keys detected:\n${deprecatedKeys
        .map((item) => `- ${item}`)
        .join('\n')}`,
    );
  }

  if (failures.length > 0) {
    console.error(failures.join('\n\n'));
    process.exit(1);
  }

  console.log('Env check passed.');
}

main();
