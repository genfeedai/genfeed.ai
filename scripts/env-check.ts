import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { DEPRECATED_ENV_KEYS, ENV_TARGETS } from './env-spec';

const rootDir = process.cwd();

function listTrackedEnvFiles(): string[] {
  const stdout = execFileSync('git', ['ls-files'], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  return stdout
    .split('\n')
    .filter(Boolean)
    .filter((filePath) => /(^|\/)\.env(\..*)?$/.test(filePath))
    .filter((filePath) => !filePath.endsWith('.env.example'));
}

function collectEnvFiles(): string[] {
  const files = new Set<string>([
    '.env.example',
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
  const trackedEnvFiles = listTrackedEnvFiles();
  const deprecatedKeys = findDeprecatedKeys(collectEnvFiles());
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
