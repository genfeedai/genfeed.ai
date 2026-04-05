import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Logger } from '@nestjs/common';
import { globSync } from 'glob';

const logger = new Logger('CheckAppUiBoundaries');

const INCLUDE_GLOBS = ['apps/app/**/*.{ts,tsx,js,jsx}'];

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
  'apps/admin/app/(protected)/administration/announcements/announcements-page.tsx',
  'apps/admin/app/(protected)/administration/roles/roles-list.tsx',
  'apps/admin/app/(protected)/administration/subscriptions/subscriptions-list.tsx',
  'apps/admin/app/(protected)/automation/bots/bots-page.tsx',
  'apps/admin/app/(protected)/automation/workflows/workflows-page.tsx',
  'apps/admin/app/(protected)/content/prompts/list/prompts-page.tsx',
  'apps/admin/app/(protected)/crm/alignment/alignment-page.tsx',
  'apps/admin/app/(protected)/crm/analytics/analytics-page.tsx',
  'apps/admin/app/(protected)/crm/companies/[id]/company-detail.tsx',
  'apps/admin/app/(protected)/crm/companies/companies-list.tsx',
  'apps/admin/app/(protected)/crm/leads/[id]/lead-detail.tsx',
  'apps/admin/app/(protected)/crm/leads/[id]/proactive-onboarding-card.tsx',
  'apps/admin/app/(protected)/crm/leads/crm-leads-page.tsx',
  'apps/admin/app/(protected)/crm/tasks/tasks-page.tsx',
  'apps/admin/app/(protected)/darkroom/_components/dataset-uploader.tsx',
  'apps/admin/app/(protected)/darkroom/_components/image-grid.tsx',
  'apps/admin/app/(protected)/darkroom/gallery/gallery-page.tsx',
  'apps/admin/app/(protected)/darkroom/generate/generate-page.tsx',
  'apps/admin/app/(protected)/darkroom/infrastructure/infrastructure-page.tsx',
  'apps/admin/app/(protected)/darkroom/lip-sync/lip-sync-page.tsx',
  'apps/admin/app/(protected)/darkroom/training/training-page.tsx',
  'apps/admin/app/(protected)/darkroom/voices/voices-page.tsx',
  'apps/admin/app/(protected)/library/voices/voices-library-page.tsx',
  'apps/admin/app/(protected)/marketplace/marketplace-page.tsx',
  'apps/admin/app/(protected)/overview/dashboard/activity-chart.tsx',
  'apps/admin/app/(protected)/overview/dashboard/overview-page.tsx',
  'apps/admin/app/(protected)/organization/components/edit-setting-modal.tsx',
  'apps/app/app/(onboarding)/onboarding/brand/brand-content.tsx',
  'apps/app/app/(onboarding)/onboarding/plan/plan-content.tsx',
  'apps/app/app/(onboarding)/onboarding/post-signup/page.tsx',
  'apps/app/app/(onboarding)/onboarding/proactive/proactive-content.tsx',
  'apps/app/app/(onboarding)/onboarding/success/success-content.tsx',
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
  const files = globSync(INCLUDE_GLOBS, {
    absolute: true,
    ignore: EXCLUDE_GLOBS,
    nodir: true,
  });

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
