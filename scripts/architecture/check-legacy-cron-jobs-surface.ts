import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const repoRoot = process.cwd();
const roots = ['apps', 'packages'];
const ignoredDirectories = new Set([
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'generated',
  'node_modules',
]);
const sourceFilePattern = /\.(ts|tsx)$/;
const testFilePattern = /(?:\.test|\.spec)\.tsx?$/;
const legacySdkImport = '@services/automation/cron-jobs.service';
const legacyServerImport = 'collections/cron-jobs/services/cron-jobs.service';
const legacyMutationCallPattern =
  /\b(?:cronJobsService|cronJobService|service)\s*\.\s*(?:create|update|pause|resume|delete|runNow|testWebhook)\s*\(/;
const legacyServerMutationCallPattern =
  /\b(?:cronJobsService|cronJobService|service)\s*\.\s*(?:create|update|pause|resume|delete|runNow)\s*\(/;
const legacyRowCreatePattern = /\bcronJob\s*\.\s*create\s*\(/;
const legacyLabRoutePattern = /['"`]\/lab\/cron-jobs['"`]/;

interface Violation {
  file: string;
  message: string;
}

function walk(directory: string, files: string[]): void {
  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) {
      continue;
    }

    const absolutePath = join(directory, entry);
    const stat = lstatSync(absolutePath);

    if (stat.isSymbolicLink()) {
      continue;
    }

    if (stat.isDirectory()) {
      walk(absolutePath, files);
      continue;
    }

    if (sourceFilePattern.test(entry)) {
      files.push(absolutePath);
    }
  }
}

const files: string[] = [];
for (const root of roots) {
  walk(join(repoRoot, root), files);
}

const violations: Violation[] = [];

for (const file of files) {
  const relativeFile = relative(repoRoot, file);
  const source = readFileSync(file, 'utf8');
  const isTestFile = testFilePattern.test(relativeFile);

  if (isTestFile) {
    continue;
  }

  if (legacyLabRoutePattern.test(source)) {
    violations.push({
      file: relativeFile,
      message:
        'Legacy cron jobs lab routes must redirect to workflow scheduling instead of linking to /lab/cron-jobs.',
    });
  }

  if (legacyRowCreatePattern.test(source)) {
    violations.push({
      file: relativeFile,
      message:
        'New legacy cron job rows are retired. Create scheduled workflows instead.',
    });
  }

  if (
    source.includes(legacySdkImport) &&
    legacyMutationCallPattern.test(source)
  ) {
    violations.push({
      file: relativeFile,
      message:
        'Product UI must not call legacy cron job mutation APIs. Use workflow schedules instead.',
    });
  }

  if (
    source.includes(legacyServerImport) &&
    legacyServerMutationCallPattern.test(source)
  ) {
    violations.push({
      file: relativeFile,
      message:
        'Server product code must not call legacy cron job mutation APIs. Use workflow scheduling services instead.',
    });
  }
}

if (violations.length > 0) {
  console.error('\nLegacy cron-jobs surface guard failed:');
  for (const violation of violations) {
    console.error(`- ${violation.file}: ${violation.message}`);
  }
  process.exit(1);
}

console.log('Legacy cron-jobs surface guard passed.');
