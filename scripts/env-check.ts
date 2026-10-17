import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  findEnvTemplateDrift,
  isEnvTemplate,
  isForbiddenEnvFile,
  parseTemplateKeys,
} from './env-guard';
import {
  DEPRECATED_ENV_KEYS,
  ENV_TARGETS,
  ROOT_ENV_SECTIONS,
} from './env-spec';

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

function listStagedFiles(): string[] {
  return execFileSync(
    'git',
    ['diff', '--cached', '--name-only', '--diff-filter=ACMR'],
    {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
    .split('\n')
    .filter(Boolean);
}

function listTrackedEnvTemplates(trackedFiles: string[]): string[] {
  return trackedFiles.filter(isEnvTemplate);
}

function formatForbiddenEnvFiles(heading: string, files: string[]): string {
  return `${heading}\n${files.map((filePath) => `- ${filePath}`).join('\n')}\nOnly .env.example templates may be committed; keep real values in untracked files.`;
}

function findTemplateDrift(): string[] {
  const templateKeys = parseTemplateKeys(
    fs.readFileSync(path.join(rootDir, '.env.example'), 'utf8'),
  );
  const canonicalKeys = new Set(
    ROOT_ENV_SECTIONS.flatMap((section) => section.keys),
  );
  const targetKeys = new Set(
    ENV_TARGETS.flatMap((target) => [
      ...target.sharedKeys,
      ...target.directKeys,
      ...Object.keys(target.mappedKeys),
    ]),
  );
  const drift = findEnvTemplateDrift({
    canonicalKeys,
    targetKeys,
    templateKeys,
  });
  const findings: string[] = [];

  if (drift.missingFromTemplate.length > 0) {
    findings.push(
      `Keys in scripts/env-spec.ts missing from .env.example (document them, or delete them from the spec if nothing reads them):\n${drift.missingFromTemplate
        .map((key) => `- ${key}`)
        .join('\n')}`,
    );
  }

  if (drift.unknownToSpec.length > 0) {
    findings.push(
      `Keys in .env.example missing from ROOT_ENV_SECTIONS in scripts/env-spec.ts (add them, or delete them from the template if nothing reads them):\n${drift.unknownToSpec
        .map((key) => `- ${key}`)
        .join('\n')}`,
    );
  }

  if (drift.targetKeysOutsideSections.length > 0) {
    findings.push(
      `Keys an env target reads but ROOT_ENV_SECTIONS does not list:\n${drift.targetKeysOutsideSections
        .map((key) => `- ${key}`)
        .join('\n')}`,
    );
  }

  return findings;
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
  // `--staged` is the pre-commit mode: refuse real env files in the index
  // before they become a commit. The full check below runs in CI and turbo.
  if (process.argv.includes('--staged')) {
    const stagedEnvFiles = listStagedFiles().filter(isForbiddenEnvFile);

    if (stagedEnvFiles.length > 0) {
      console.error(
        formatForbiddenEnvFiles(
          'Refusing to commit env files:',
          stagedEnvFiles,
        ),
      );
      process.exit(1);
    }

    return;
  }

  const trackedFiles = listTrackedFiles();

  if (trackedFiles === null) {
    console.warn('Skipping tracked env file check outside a git worktree.');
  }

  // Outside a worktree only the root template is discoverable, but the
  // deprecated-key scan still runs against it.
  const trackedEnvFiles = trackedFiles
    ? trackedFiles.filter(isForbiddenEnvFile)
    : [];
  const envTemplates = trackedFiles
    ? listTrackedEnvTemplates(trackedFiles)
    : ['.env.example'];
  const deprecatedKeys = findDeprecatedKeys(collectEnvFiles(envTemplates));
  const failures: string[] = [];

  if (trackedEnvFiles.length > 0) {
    failures.push(
      formatForbiddenEnvFiles(
        'Tracked real env files are not allowed:',
        trackedEnvFiles,
      ),
    );
  }

  if (deprecatedKeys.length > 0) {
    failures.push(
      `Deprecated env keys detected:\n${deprecatedKeys
        .map((item) => `- ${item}`)
        .join('\n')}`,
    );
  }

  if (fs.existsSync(path.join(rootDir, '.env.example'))) {
    failures.push(...findTemplateDrift());
  }

  if (failures.length > 0) {
    console.error(failures.join('\n\n'));
    process.exit(1);
  }

  console.log('Env check passed.');
}

main();
