import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Logger } from '@nestjs/common';
import { globSync } from 'glob';

const logger = new Logger('CheckRawButtonUsage');

const INCLUDE_GLOBS = [
  'apps/web/**/*.{tsx,jsx}',
  'packages/pages/**/*.{tsx,jsx}',
];

const EXCLUDE_GLOBS = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/*.stories.*',
  '**/*.mdx',
  '**/*.md',
  '**/node_modules/**',
  '**/dist/**',
];

// Explicit allowlist for paths where native <button> is acceptable.
const ALLOWLIST_PATH_SEGMENTS = [
  '/packages/ui/primitives/',
  '/packages/workflow-cloud/src/components/ui/',
];

const ALLOWLIST_VIOLATION_FILES = new Set([
  'apps/web/app/app/(full-screen)/editor/page.tsx',
  'apps/web/website/app/(public)/agencies/agencies-content.tsx',
  'apps/web/website/app/(public)/articles/[slug]/article-detail.tsx',
  'apps/web/website/app/(public)/influencers/ai-influencers-content.tsx',
  'apps/web/website/packages/components/NotFoundContent.tsx',
  'apps/web/website/packages/components/content/post-card/PostCard.tsx',
  'apps/web/website/packages/components/home/_marketplace-cta.tsx',
  'packages/pages/analytics/overview/analytics-overview.tsx',
  'packages/pages/analytics/trend-turnover/analytics-trend-turnover.tsx',
  'packages/pages/automation/agents/new/AgentWizardPage.tsx',
  'packages/pages/automation/bots/BotsList.tsx',
  'packages/pages/brands/components/latest-articles/BrandDetailLatestArticles.tsx',
  'packages/pages/brands/components/latest-images/BrandDetailLatestImages.tsx',
  'packages/pages/brands/components/latest-videos/BrandDetailLatestVideos.tsx',
  'packages/pages/brands/components/sidebar/BrandDetailExternalLinksCard.tsx',
  'packages/pages/ingredients/detail/ingredient-detail.tsx',
  'packages/pages/mission-control/components/AgentRunCard.tsx',
  'packages/pages/not-found/not-found-page.tsx',
  'packages/pages/settings/help/settings-help-page.tsx',
  'packages/pages/settings/voice/settings-voice-page.tsx',
  'packages/pages/studio/page/StudioPageContent.tsx',
]);

const rawButtonPattern = /<button(\s|>)/g;
const styledAnchorPattern = /<(a|Link)\b[\s\S]*?className="([^"]+)"[\s\S]*?>/g;

type Violation = {
  file: string;
  line: number;
  type: 'raw-button' | 'styled-anchor';
};

type CheckResult = {
  violations: Violation[];
};

function shouldAllowFile(filePath: string): boolean {
  const normalized = filePath.replaceAll('\\', '/');
  return ALLOWLIST_PATH_SEGMENTS.some((segment) =>
    normalized.includes(segment),
  );
}

function findViolations(filePath: string, rootDir: string): Violation[] {
  const content = readFileSync(filePath, 'utf-8');
  const matches = [...content.matchAll(rawButtonPattern)];
  const violations: Violation[] = [];

  for (const match of matches) {
    const index = match.index ?? 0;
    const line = content.slice(0, index).split('\n').length;
    violations.push({
      file: path.relative(rootDir, filePath),
      line,
      type: 'raw-button',
    });
  }

  const anchorMatches = [...content.matchAll(styledAnchorPattern)];
  for (const match of anchorMatches) {
    const className = match[2] ?? '';
    if (!isButtonLikeClassName(className)) {
      continue;
    }

    const index = match.index ?? 0;
    const line = content.slice(0, index).split('\n').length;
    violations.push({
      file: path.relative(rootDir, filePath),
      line,
      type: 'styled-anchor',
    });
  }

  return violations;
}

function isButtonLikeClassName(className: string): boolean {
  const hasInlineLayout =
    className.includes('inline-flex') || className.includes('items-center');
  const hasButtonBox =
    className.includes('rounded') ||
    className.includes('border') ||
    className.includes('px-') ||
    className.includes('py-');
  const hasInteraction =
    className.includes('hover:bg') || className.includes('cursor-pointer');
  const hasButtonWeight =
    className.includes('font-medium') || className.includes('font-black');

  return hasInlineLayout && hasButtonBox && (hasInteraction || hasButtonWeight);
}

export function runCheckRawButtonUsage(): CheckResult {
  const rootDir = process.cwd();
  const files = globSync(INCLUDE_GLOBS, {
    absolute: true,
    ignore: EXCLUDE_GLOBS,
    nodir: true,
  });

  const allViolations: Violation[] = [];

  for (const filePath of files) {
    if (shouldAllowFile(filePath)) {
      continue;
    }
    const violations = findViolations(filePath, rootDir).filter(
      (violation) => !ALLOWLIST_VIOLATION_FILES.has(violation.file),
    );
    allViolations.push(...violations);
  }

  return { violations: allViolations };
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && path.resolve(entryPoint) === __filename;
}

if (isMainModule()) {
  const { violations } = runCheckRawButtonUsage();

  if (violations.length > 0) {
    logger.error(
      'Raw button controls found in production UI code. Use shared Button/AppLink primitives instead.',
    );
    for (const violation of violations) {
      logger.error(`- [${violation.type}] ${violation.file}:${violation.line}`);
    }
    process.exit(1);
  }

  logger.log('No raw button controls found in production UI code.');
}
