/**
 * Guard hydration-sensitive TypeScript against implicit runtime locales.
 *
 * Bare locale formatting can render different server and browser text, which
 * causes React hydration mismatches. Existing intentional call sites are a
 * shrinking ratchet: new calls fail, and removed calls require pruning the
 * documented allowance.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';

const DEFAULT_INCLUDE_GLOBS = [
  'apps/app/**/*.{ts,tsx}',
  'apps/website/**/*.{ts,tsx}',
  'packages/agent/src/components/**/*.{ts,tsx}',
  'packages/helpers/src/formatting/**/*.{ts,tsx}',
  'packages/helpers/src/business/pricing/**/*.{ts,tsx}',
  'packages/models/analytics/**/*.{ts,tsx}',
  'packages/pages/**/*.{ts,tsx}',
  'packages/pricing/src/**/*.{ts,tsx}',
  'packages/ui/src/**/*.{ts,tsx}',
  'packages/workflow-ui/src/**/*.{ts,tsx}',
  'packages/workflows/src/ui/**/*.{ts,tsx}',
];

const DEFAULT_IGNORE_GLOBS = [
  '**/*.spec.*',
  '**/*.test.*',
  '**/*.stories.*',
  '**/dist/**',
  '**/node_modules/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/generated/**',
];

export type ImplicitLocaleApi =
  | 'intl-date-time-format'
  | 'intl-number-format'
  | 'to-locale-date-string'
  | 'to-locale-string'
  | 'to-locale-time-string';

export type ImplicitLocaleAllowance = {
  api: ImplicitLocaleApi;
  count: number;
  file: string;
  reason: string;
};

export type ImplicitLocaleOccurrence = {
  api: ImplicitLocaleApi;
  expression: string;
  file: string;
  line: number;
};

export type DeterministicLocaleViolation =
  | {
      kind: 'implicit-locale';
      message: string;
      occurrence: ImplicitLocaleOccurrence;
    }
  | {
      allowance: ImplicitLocaleAllowance;
      actualCount: number;
      kind: 'stale-allowance';
      message: string;
    };

export type DeterministicLocaleResult = {
  occurrences: ImplicitLocaleOccurrence[];
  scannedFileCount: number;
  violations: DeterministicLocaleViolation[];
};

export type DeterministicLocaleOptions = {
  allowances?: readonly ImplicitLocaleAllowance[];
  ignoreGlobs?: string[];
  includeGlobs?: string[];
  rootDir?: string;
};

const LEGACY_UI_REASON =
  'Existing interactive UI display retained as bounded migration debt; new usage is forbidden.';

function allowance(
  file: string,
  api: ImplicitLocaleApi,
  count: number,
  reason: string,
): ImplicitLocaleAllowance {
  return {
    api,
    count,
    file,
    reason,
  };
}

function legacyUiAllowance(
  file: string,
  api: ImplicitLocaleApi,
  count: number,
): ImplicitLocaleAllowance {
  return allowance(file, api, count, LEGACY_UI_REASON);
}

export const IMPLICIT_LOCALE_ALLOWANCES: ImplicitLocaleAllowance[] = [
  legacyUiAllowance(
    'apps/app/app/(onboarding)/onboarding/(wizard)/summary/summary-content.tsx',
    'to-locale-string',
    1,
  ),
  legacyUiAllowance(
    'apps/app/app/(protected)/[orgSlug]/[brandSlug]/analytics/_surface/analytics-work-surface-adapter.tsx',
    'to-locale-string',
    1,
  ),
  legacyUiAllowance(
    'apps/app/app/(protected)/[orgSlug]/[brandSlug]/orchestration/runs/RunRoutingInsights.tsx',
    'to-locale-string',
    1,
  ),
  legacyUiAllowance(
    'apps/app/app/(protected)/[orgSlug]/[brandSlug]/orchestration/runs/RunStatsStrip.tsx',
    'to-locale-string',
    1,
  ),
  legacyUiAllowance(
    'apps/app/app/(protected)/[orgSlug]/[brandSlug]/posts/composer/cross-post-composer-page.tsx',
    'intl-date-time-format',
    1,
  ),
  legacyUiAllowance(
    'apps/app/app/(protected)/[orgSlug]/[brandSlug]/posts/review/components/ReviewItemCard.tsx',
    'to-locale-string',
    1,
  ),
  legacyUiAllowance(
    'apps/app/app/(protected)/[orgSlug]/~/connect/connect-genfeed-flow.tsx',
    'to-locale-string',
    1,
  ),
  legacyUiAllowance(
    'apps/app/app/(protected)/[orgSlug]/~/settings/(pages)/organization/api-keys/content.tsx',
    'to-locale-string',
    1,
  ),
  legacyUiAllowance(
    'apps/app/app/(protected)/[orgSlug]/~/settings/(pages)/organization/billing/content.tsx',
    'to-locale-string',
    6,
  ),
  legacyUiAllowance(
    'apps/app/app/(protected)/[orgSlug]/~/settings/(pages)/organization/credits/credit-top-up-panel.tsx',
    'to-locale-string',
    3,
  ),
  legacyUiAllowance(
    'apps/app/app/(protected)/[orgSlug]/~/settings/(pages)/organization/webhooks/content.tsx',
    'to-locale-string',
    1,
  ),
  legacyUiAllowance(
    'apps/app/app/(protected)/admin/administration/credit-usage/credit-usage-list.tsx',
    'to-locale-string',
    2,
  ),
  legacyUiAllowance(
    'apps/app/app/(protected)/admin/administration/subscriptions/subscriptions-list.tsx',
    'to-locale-date-string',
    1,
  ),
  legacyUiAllowance(
    'apps/app/app/(protected)/admin/administration/users/users-list.tsx',
    'to-locale-string',
    1,
  ),
  legacyUiAllowance(
    'apps/app/app/(protected)/admin/fleet/pipeline/pipeline-page.tsx',
    'to-locale-date-string',
    1,
  ),
  legacyUiAllowance(
    'apps/app/app/(protected)/admin/fleet/training/training-page.tsx',
    'to-locale-date-string',
    1,
  ),
  legacyUiAllowance(
    'apps/app/app/(protected)/admin/overview/analytics/organizations/analytics-organizations-list.tsx',
    'to-locale-string',
    3,
  ),
  legacyUiAllowance(
    'apps/app/app/(protected)/admin/overview/dashboard/overview-page.tsx',
    'to-locale-string',
    2,
  ),
  legacyUiAllowance(
    'apps/app/packages/components/research/ads/ads-metric.helpers.ts',
    'to-locale-string',
    1,
  ),
  legacyUiAllowance(
    'apps/app/src/features/workflows/nodes/distribution/CaptionGenNode.tsx',
    'to-locale-string',
    3,
  ),
  legacyUiAllowance(
    'apps/app/src/features/workflows/workspace/WorkflowSurfaceInspector.tsx',
    'to-locale-string',
    1,
  ),
  legacyUiAllowance(
    'apps/website/packages/ui/workflow-builder/nodes/RssInputNode.tsx',
    'to-locale-date-string',
    1,
  ),
  allowance(
    'apps/website/scripts/generate-llms-txt.ts',
    'to-locale-string',
    5,
    'Build-time documentation output follows the environment locale and is never hydrated.',
  ),
  legacyUiAllowance(
    'packages/agent/src/components/AgentActivityFeed.tsx',
    'to-locale-date-string',
    1,
  ),
  legacyUiAllowance(
    'packages/agent/src/components/AgentStrategyStatus.tsx',
    'to-locale-date-string',
    2,
  ),
  legacyUiAllowance(
    'packages/agent/src/components/ContentCalendarCard.tsx',
    'to-locale-date-string',
    1,
  ),
  legacyUiAllowance(
    'packages/agent/src/components/CreditsBalanceCard.tsx',
    'to-locale-string',
    1,
  ),
  legacyUiAllowance(
    'packages/agent/src/components/WorkflowCreatedCard.tsx',
    'to-locale-string',
    1,
  ),
  legacyUiAllowance(
    'packages/agent/src/components/blocks/DynamicBlockGrid.tsx',
    'to-locale-string',
    2,
  ),
  legacyUiAllowance(
    'packages/agent/src/components/agent-workspace-run.helpers.ts',
    'intl-date-time-format',
    1,
  ),
  allowance(
    'packages/helpers/src/formatting/timezone/timezone.helper.ts',
    'intl-date-time-format',
    1,
    'Timezone detection intentionally reads the executing client environment.',
  ),
  allowance(
    'packages/helpers/src/formatting/timezone/timezone.helper.ts',
    'to-locale-string',
    1,
    'Shared opt-in local-time helper intentionally formats for the executing client environment.',
  ),
  legacyUiAllowance(
    'packages/models/analytics/activity.model.ts',
    'to-locale-string',
    2,
  ),
  legacyUiAllowance(
    'packages/pages/agents/campaigns/AgentCampaignDetailHeader.tsx',
    'to-locale-string',
    2,
  ),
  legacyUiAllowance(
    'packages/pages/agents/campaigns/AgentCampaignsPage.tsx',
    'to-locale-string',
    5,
  ),
  legacyUiAllowance(
    'packages/pages/agents/campaigns/OutreachCampaignTargetsTable.tsx',
    'to-locale-string',
    3,
  ),
  legacyUiAllowance(
    'packages/pages/agents/campaigns/OutreachCampaignsKPI.tsx',
    'to-locale-string',
    1,
  ),
  legacyUiAllowance(
    'packages/pages/agents/campaigns/OutreachCampaignsTable.tsx',
    'to-locale-string',
    2,
  ),
  legacyUiAllowance(
    'packages/pages/agents/tasks/CronJobRunHistory.tsx',
    'to-locale-string',
    1,
  ),
  legacyUiAllowance(
    'packages/pages/agents/tasks/CronJobsList.tsx',
    'to-locale-string',
    2,
  ),
  legacyUiAllowance(
    'packages/pages/analytics/overview/analytics-overview-leaderboards.tsx',
    'to-locale-string',
    4,
  ),
  legacyUiAllowance(
    'packages/pages/analytics/posts-list/analytics-posts-list.tsx',
    'to-locale-string',
    2,
  ),
  legacyUiAllowance(
    'packages/pages/analytics/trends/trend-detail/trend-detail-analysis-card.tsx',
    'to-locale-date-string',
    1,
  ),
  legacyUiAllowance(
    'packages/pages/posts/detail/components/PostDetailCardBody.tsx',
    'to-locale-string',
    1,
  ),
  legacyUiAllowance(
    'packages/pages/studio/fastlane/FastlaneLayout.tsx',
    'intl-date-time-format',
    1,
  ),
  legacyUiAllowance(
    'packages/pages/trends/list/components/HookRemixModal.tsx',
    'to-locale-string',
    1,
  ),
  legacyUiAllowance(
    'packages/pages/twitter-pipeline/components/tweet-card.tsx',
    'to-locale-string',
    3,
  ),
  legacyUiAllowance(
    'packages/ui/src/components/articles/x-article/XArticleAssetsBar.tsx',
    'to-locale-string',
    1,
  ),
  legacyUiAllowance(
    'packages/ui/src/components/articles/x-article/XArticleGenerateForm.tsx',
    'to-locale-string',
    1,
  ),
  legacyUiAllowance(
    'packages/ui/src/components/ingredients/tabs/captions/IngredientTabsCaptions.tsx',
    'to-locale-date-string',
    1,
  ),
  legacyUiAllowance(
    'packages/ui/src/components/ingredients/tabs/metadata/IngredientTabsMetadata.tsx',
    'to-locale-string',
    2,
  ),
  legacyUiAllowance(
    'packages/ui/src/components/ingredients/tabs/posts/IngredientTabsPosts.tsx',
    'to-locale-string',
    1,
  ),
  legacyUiAllowance(
    'packages/ui/src/components/modals/automation/useModalBot.ts',
    'intl-date-time-format',
    1,
  ),
  legacyUiAllowance(
    'packages/ui/src/components/pricing/card/PricingCard.tsx',
    'to-locale-string',
    2,
  ),
  legacyUiAllowance(
    'packages/ui/src/components/posts/post-detail-sidebar/PostSidebarReviewCard.tsx',
    'to-locale-string',
    2,
  ),
  legacyUiAllowance(
    'packages/ui/src/components/time/ClientDateTime.tsx',
    'to-locale-string',
    1,
  ),
  legacyUiAllowance(
    'packages/ui/src/components/workflow-builder/nodes/RssInputNode.tsx',
    'to-locale-date-string',
    1,
  ),
  legacyUiAllowance(
    'packages/ui/src/components/workflow-builder/nodes/TrendHashtagInspirationNode.tsx',
    'to-locale-string',
    1,
  ),
  legacyUiAllowance(
    'packages/workflows/src/ui/panels/DebugPanel.tsx',
    'to-locale-time-string',
    1,
  ),
];

const IMPLICIT_LOCALE_PATTERNS: Array<{
  api: ImplicitLocaleApi;
  pattern: RegExp;
}> = [
  {
    api: 'to-locale-date-string',
    pattern: /\.toLocaleDateString\(\s*(?:\)|undefined\s*(?:,|\)))/gu,
  },
  {
    api: 'to-locale-string',
    pattern: /\.toLocaleString\(\s*(?:\)|undefined\s*(?:,|\)))/gu,
  },
  {
    api: 'to-locale-time-string',
    pattern: /\.toLocaleTimeString\(\s*(?:\)|undefined\s*(?:,|\)))/gu,
  },
  {
    api: 'intl-number-format',
    pattern: /(?:new\s+)?Intl\.NumberFormat\(\s*(?:\)|undefined\s*(?:,|\)))/gu,
  },
  {
    api: 'intl-date-time-format',
    pattern:
      /(?:new\s+)?Intl\.DateTimeFormat\(\s*(?:\)|undefined\s*(?:,|\)))/gu,
  },
];

function normalizePath(file: string): string {
  return file.replaceAll('\\', '/');
}

function allowanceKey(
  allowance: Pick<ImplicitLocaleAllowance, 'api' | 'file'>,
): string {
  return `${normalizePath(allowance.file)}:${allowance.api}`;
}

function lineForOffset(source: string, offset: number): number {
  return source.slice(0, offset).split('\n').length;
}

function groupOccurrencesByAllowanceKey(
  occurrences: readonly ImplicitLocaleOccurrence[],
): Map<string, ImplicitLocaleOccurrence[]> {
  const groups = new Map<string, ImplicitLocaleOccurrence[]>();

  for (const occurrence of occurrences) {
    const key = allowanceKey(occurrence);
    const group = groups.get(key);

    if (group) {
      group.push(occurrence);
    } else {
      groups.set(key, [occurrence]);
    }
  }

  return groups;
}

function collectImplicitLocaleOccurrences(
  filePath: string,
  rootDir: string,
): ImplicitLocaleOccurrence[] {
  const sourceText = readFileSync(filePath, 'utf8');
  const file = normalizePath(path.relative(rootDir, filePath));

  return IMPLICIT_LOCALE_PATTERNS.flatMap(({ api, pattern }) =>
    [...sourceText.matchAll(pattern)].map((match) => ({
      api,
      expression: match[0].replace(/\s+/g, ' '),
      file,
      line: lineForOffset(sourceText, match.index),
    })),
  ).sort(
    (left, right) =>
      left.line - right.line || left.api.localeCompare(right.api),
  );
}

export function runCheckDeterministicLocale(
  options: DeterministicLocaleOptions = {},
): DeterministicLocaleResult {
  const rootDir = options.rootDir ?? process.cwd();
  const allowances = options.allowances ?? IMPLICIT_LOCALE_ALLOWANCES;
  const files = globSync(options.includeGlobs ?? DEFAULT_INCLUDE_GLOBS, {
    absolute: true,
    cwd: rootDir,
    ignore: options.ignoreGlobs ?? DEFAULT_IGNORE_GLOBS,
    nodir: true,
  }).sort();
  const occurrences = files.flatMap((file) =>
    collectImplicitLocaleOccurrences(file, rootDir),
  );
  const occurrencesByKey = groupOccurrencesByAllowanceKey(occurrences);
  const allowanceByKey = new Map(
    allowances.map((allowance) => [allowanceKey(allowance), allowance]),
  );
  const violations: DeterministicLocaleViolation[] = [];

  for (const [key, matchingOccurrences] of occurrencesByKey) {
    const allowance = allowanceByKey.get(key);
    const allowedCount = allowance?.count ?? 0;

    for (const occurrence of matchingOccurrences.slice(allowedCount)) {
      violations.push({
        kind: 'implicit-locale',
        message:
          'Pass an explicit locale for hydration-stable output, or document a bounded intentional allowance.',
        occurrence,
      });
    }
  }

  for (const allowance of allowances) {
    const actualCount =
      occurrencesByKey.get(allowanceKey(allowance))?.length ?? 0;
    if (actualCount >= allowance.count) {
      continue;
    }

    violations.push({
      actualCount,
      allowance,
      kind: 'stale-allowance',
      message:
        'Implicit locale usage decreased. Lower or remove this allowance so the ratchet only shrinks.',
    });
  }

  return {
    occurrences,
    scannedFileCount: files.length,
    violations,
  };
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && path.resolve(entryPoint) === __filename;
}

if (isMainModule()) {
  const result = runCheckDeterministicLocale();

  if (process.argv.includes('--print-allowances')) {
    const counts = groupOccurrencesByAllowanceKey(result.occurrences);
    console.log(
      JSON.stringify(
        [...counts.entries()].map(([key, occurrences]) => {
          const [file, api] = key.split(/:(?=[^:]+$)/);
          return {
            api,
            count: occurrences.length,
            file,
            reason:
              'Existing locale-sensitive UI; migrate to an explicit locale when this surface is touched.',
          };
        }),
        null,
        2,
      ),
    );
    process.exit(0);
  }

  if (result.violations.length > 0) {
    console.error('Deterministic locale guard violations found:');

    for (const violation of result.violations) {
      if (violation.kind === 'implicit-locale') {
        const { occurrence } = violation;
        console.error(
          `- ${occurrence.file}:${occurrence.line} [${occurrence.api}] ${occurrence.expression} — ${violation.message}`,
        );
        continue;
      }

      console.error(
        `- ${violation.allowance.file} [${violation.allowance.api}] expected ${violation.allowance.count}, found ${violation.actualCount} — ${violation.message}`,
      );
    }

    process.exit(1);
  }

  console.log(
    `Deterministic locale guard passed across ${result.scannedFileCount} hydration-sensitive source file(s).`,
  );
}
