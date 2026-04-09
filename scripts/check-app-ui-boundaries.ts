import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Logger } from '@nestjs/common';

const logger = new Logger('CheckAppUiBoundaries');

const EXCLUDE_GLOBS = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/*.stories.*',
  '**/*.md',
  '**/*.mdx',
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
];

const LEGACY_BUTTON_IMPORT_PATTERNS = [
  /@ui\/buttons\/base\/Button/g,
  /@components\/buttons\/base\/Button/g,
];

const LEGACY_INPUT_IMPORT_PATTERNS = [
  /@ui\/forms\/inputs\/input\/form-input\/FormInput/g,
  /@components\/forms\/inputs\/input\/form-input\/FormInput/g,
];

const WRAPPER_ONLY_REEXPORT_PATTERN =
  /^\s*export\s+(?:\{[\s\S]*?\}|(?:type\s+)?\*\s+from)\s+['"]@ui\/.+['"];?\s*$/m;

const LEGACY_BUTTON_IMPORT_ALLOWLIST = new Set([
  'apps/app/app/(protected)/admin/administration/announcements/announcements-page.tsx',
  'apps/app/app/(protected)/admin/administration/roles/roles-list.tsx',
  'apps/app/app/(protected)/admin/administration/subscriptions/subscriptions-list.tsx',
  'apps/app/app/(protected)/admin/automation/bots/bots-page.tsx',
  'apps/app/app/(protected)/admin/automation/workflows/workflows-page.tsx',
  'apps/app/app/(protected)/admin/content/prompts/list/prompts-page.tsx',
  'apps/app/app/(protected)/admin/darkroom/_components/dataset-uploader.tsx',
  'apps/app/app/(protected)/admin/darkroom/_components/image-grid.tsx',
  'apps/app/app/(protected)/admin/darkroom/gallery/gallery-page.tsx',
  'apps/app/app/(protected)/admin/darkroom/generate/generate-page.tsx',
  'apps/app/app/(protected)/admin/darkroom/infrastructure/infrastructure-page.tsx',
  'apps/app/app/(protected)/admin/darkroom/lip-sync/lip-sync-page.tsx',
  'apps/app/app/(protected)/admin/darkroom/training/training-page.tsx',
  'apps/app/app/(protected)/admin/darkroom/voices/voices-page.tsx',
  'apps/app/app/(protected)/admin/library/voices/voices-library-page.tsx',
  'apps/app/app/(protected)/admin/overview/dashboard/activity-chart.tsx',
  'apps/app/app/(protected)/admin/overview/dashboard/overview-page.tsx',
  'apps/app/app/(protected)/admin/organization/components/edit-setting-modal.tsx',
  'apps/app/app/(onboarding)/onboarding/(wizard)/brand/brand-content.tsx',
  'apps/app/app/(onboarding)/onboarding/(wizard)/providers/providers-content.tsx',
  'apps/app/app/(onboarding)/onboarding/(wizard)/success/success-content.tsx',
  'apps/app/app/(onboarding)/onboarding/post-signup/page.tsx',
  'apps/app/app/(onboarding)/onboarding/(wizard)/proactive/proactive-content.tsx',
  'apps/app/app/(protected)/studio/clips/page.tsx',
  'apps/app/packages/components/research/ads/AdsResearchPageClient.tsx',
]);

type Violation =
  | {
      kind: 'legacy-button-import';
      file: string;
      line: number;
    }
  | {
      kind: 'legacy-input-import';
      file: string;
      line: number;
    }
  | {
      kind: 'wrapper-only-reexport';
      file: string;
    };

export function runCheckAppUiBoundaries(): { violations: Violation[] } {
  const rootDir = process.cwd();
  const files = collectSourceFiles(path.join(rootDir, 'apps', 'app'));

  const violations: Violation[] = [];

  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf8');
    const relativePath = path.relative(rootDir, filePath);

    if (WRAPPER_ONLY_REEXPORT_PATTERN.test(content)) {
      violations.push({
        file: relativePath,
        kind: 'wrapper-only-reexport',
      });
    }

    if (LEGACY_BUTTON_IMPORT_ALLOWLIST.has(relativePath)) {
      continue;
    }

    for (const pattern of LEGACY_BUTTON_IMPORT_PATTERNS) {
      for (const match of content.matchAll(pattern)) {
        const index = match.index ?? 0;
        violations.push({
          file: relativePath,
          kind: 'legacy-button-import',
          line: content.slice(0, index).split('\n').length,
        });
      }
    }

    for (const pattern of LEGACY_INPUT_IMPORT_PATTERNS) {
      for (const match of content.matchAll(pattern)) {
        const index = match.index ?? 0;
        violations.push({
          file: relativePath,
          kind: 'legacy-input-import',
          line: content.slice(0, index).split('\n').length,
        });
      }
    }
  }

  return { violations };
}

function shouldSkipPath(relativePath: string): boolean {
  return EXCLUDE_GLOBS.some((pattern) => {
    const normalizedPattern = pattern.replaceAll('**/', '');
    const trimmedPattern = normalizedPattern.replaceAll('/**', '');
    const escapedPattern = trimmedPattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(
      escapedPattern.replaceAll('*', '.*').replaceAll('?', '.'),
    );

    return regex.test(relativePath);
  });
}

function isSourceFile(fileName: string): boolean {
  return /\.(ts|tsx|js|jsx)$/.test(fileName);
}

function collectSourceFiles(dirPath: string): string[] {
  const entries = readdirSync(dirPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(dirPath, entry.name);
    const relativePath = path.relative(process.cwd(), absolutePath);

    if (shouldSkipPath(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(absolutePath));
      continue;
    }

    if (entry.isFile() && isSourceFile(entry.name)) {
      files.push(absolutePath);
    }
  }

  return files;
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && path.resolve(entryPoint) === __filename;
}

if (isMainModule()) {
  const { violations } = runCheckAppUiBoundaries();

  if (violations.length > 0) {
    logger.error(
      'App-layer UI boundary violations found. Import shared UI directly from @ui and do not add new app-local wrapper aliases or new legacy button imports.',
    );

    for (const violation of violations) {
      if (
        violation.kind === 'legacy-button-import' ||
        violation.kind === 'legacy-input-import'
      ) {
        logger.error(
          `- [${violation.kind}] ${violation.file}:${violation.line}`,
        );
        continue;
      }

      logger.error(`- [${violation.kind}] ${violation.file}`);
    }

    process.exit(1);
  }

  logger.log('App-layer UI boundaries are intact.');
}
