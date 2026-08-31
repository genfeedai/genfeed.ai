import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

function collectSourceFiles(relativeRoot: string): string[] {
  return readdirSync(join(process.cwd(), relativeRoot)).flatMap((entry) => {
    const relativePath = `${relativeRoot}/${entry}`;
    const absolutePath = join(process.cwd(), relativePath);

    if (statSync(absolutePath).isDirectory()) {
      return collectSourceFiles(relativePath);
    }

    return /\.tsx?$/u.test(entry) && !/\.test\.tsx?$/u.test(entry)
      ? [relativePath]
      : [];
  });
}

const DIVIDER_SOURCES = [
  'app/(protected)/[orgSlug]/[brandSlug]/tasks/issues-list.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/workspace/workspace-overview-sidebar.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/workspace/workspace-task-loading.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/workspace/workspace-task-outputs-card.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/workspace/workspace-task-queue-card.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/workspace/workspace-task-thread-card.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/studio/edit/[id]/EditorTextTrackList.tsx',
  'app/(protected)/[orgSlug]/~/settings/(pages)/personal/settings-progress-rewards-card.tsx',
] as const;

const WORKFLOW_ROUTE_SOURCES = [
  'app/(protected)/[orgSlug]/[brandSlug]/automation/workflows/[id]/WorkflowDetailPageClient.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/automation/workflows/new/WorkflowNewPageClient.tsx',
] as const;

const LIGHT_THEME_CRITICAL_SOURCES = [
  ...collectSourceFiles('app/(onboarding)/onboarding'),
  ...collectSourceFiles('app/(protected)/[orgSlug]/[brandSlug]/tasks'),
] as const;

const APP_PRODUCT_SOURCES = [
  ...collectSourceFiles('app'),
  ...collectSourceFiles('packages'),
  ...collectSourceFiles('src'),
] as const;

const CARD_MIGRATION_SOURCES = [
  'app/(onboarding)/onboarding/(wizard)/providers/providers-action-bar.tsx',
  'app/(onboarding)/onboarding/(wizard)/providers/providers-server-list.tsx',
  'app/(onboarding)/onboarding/(wizard)/providers/providers-status-card.tsx',
  'app/(onboarding)/onboarding/(wizard)/providers/providers-tool-list.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/automation/autopilot/AgentStrategiesEmptyState.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/library/voices/voice-catalog-list.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/studio/clips/components/ClipsInputForm.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/studio/clips/components/ClipsProgressView.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/studio/clips/components/HighlightReviewCard.tsx',
  'packages/components/research/ads/AdsResearchWatchlistPanel.tsx',
] as const;

const OVERLAY_MENU_SOURCES = [
  'app/(protected)/[orgSlug]/[brandSlug]/workspace/workspace-task-brand-mention-list.tsx',
  'src/features/workflows/pages/library/WorkflowCardDropdown.tsx',
] as const;

const ICONIC_STATUS_SOURCES = [
  'app/(protected)/[orgSlug]/[brandSlug]/automation/agents/AgentHubPage.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/automation/runs/ActiveRunsPanel.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/automation/runs/WorkflowExecutionCard.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/workspace/workspace-dashboard.tsx',
  'app/(protected)/[orgSlug]/~/settings/(pages)/organization/api-keys/byok-provider-card.tsx',
  'src/features/workflows/components/editor/CloudCreditsIndicator.tsx',
] as const;

const TASK_STATUS_SOURCES = [
  'app/(protected)/[orgSlug]/[brandSlug]/tasks/issues-list.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/tasks/issue-overlay.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/tasks/[id]/issue-header.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/tasks/[id]/issue-sidebar.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/tasks/[id]/sub-issue-row.tsx',
] as const;

describe('semantic theme surface contracts', () => {
  it.each(DIVIDER_SOURCES)(
    'uses the theme border token for ordinary dividers in %s',
    (relativePath) => {
      const source = readSource(relativePath);

      expect(source).not.toContain('divide-white');
      expect(source).toContain('divide-border');
    },
  );

  it('uses the foreground token for the onboarding loading indicator', () => {
    const source = readSource('app/(onboarding)/onboarding/(wizard)/page.tsx');

    expect(source).not.toContain('border-t-white');
    expect(source).toContain('border-t-foreground');
  });

  it('lets the workflow editor inherit global semantic theme tokens', () => {
    const source = readSource(
      'src/features/workflows/styles/workflow-scope.css',
    );

    expect(source).not.toMatch(
      /--(?:background|foreground|card|popover|primary|secondary|muted|accent|destructive|border|input|ring):/,
    );
    expect(source).not.toContain('--color-background:');
    expect(source).not.toContain('#1f1f1f');
    expect(source).toContain('hsl(var(--card))');
    expect(source).toContain('var(--category-ai)');
  });

  it.each(WORKFLOW_ROUTE_SOURCES)(
    'uses semantic Tailwind colors for workflow route chrome in %s',
    (relativePath) => {
      const source = readSource(relativePath);

      expect(source).not.toContain('bg-[var(--background)]');
      expect(source).not.toContain('text-[var(--foreground)]');
      expect(source).toContain('bg-background');
      expect(source).toContain('text-foreground');
    },
  );

  it('uses semantic CSS colors for moodboard navigation chrome', () => {
    const source = readSource('src/features/moodboard/MoodBoardCanvas.tsx');

    expect(source).not.toContain('rgba(255,255,255,0.06)');
    expect(source).not.toContain('oklch(1 0 0 / 0.14)');
    expect(source).not.toContain('oklch(1 0 0 / 0.22)');
    expect(source).not.toContain('oklch(0 0 0 / 0.55)');
    expect(source).toContain('hsl(var(--foreground) / 0.08)');
    expect(source).toContain('hsl(var(--background) / 0.55)');
  });

  it('uses semantic CSS colors for workflow canvas navigation chrome', () => {
    const source = readSource(
      '../../packages/workflows/src/ui/canvas/WorkflowCanvas.tsx',
    );

    expect(source).not.toContain('rgba(255, 255, 255, 0.08)');
    expect(source).not.toContain('rgba(0, 0, 0, 0.8)');
    expect(source).toContain('hsl(var(--foreground) / 0.08)');
    expect(source).toContain('hsl(var(--background) / 0.8)');
  });

  it('uses the theme border token for batch job dividers', () => {
    const source = readSource(
      'src/features/workflows/pages/batch/BatchComposer.tsx',
    );

    expect(source).not.toContain('divide-white');
    expect(source).toContain('divide-border');
  });

  it.each(LIGHT_THEME_CRITICAL_SOURCES)(
    'uses role or ladder tokens for light-theme-critical chrome in %s',
    (relativePath) => {
      const source = readSource(relativePath);

      expect(source).not.toMatch(
        /\b(?:bg-black|bg-white|text-white|border-white)(?:\/(?:\d+|\[[^\]]+\]))?\b/u,
      );
      expect(source).not.toMatch(
        /dark:(?:bg|text|border)-(?:slate|zinc|gray|neutral|stone)-\d+/u,
      );
    },
  );

  it.each(APP_PRODUCT_SOURCES)(
    'documents every intentional fixed content color in %s',
    (relativePath) => {
      const unmarkedLines = readSource(relativePath)
        .split('\n')
        .filter(
          (line) =>
            /\b(?:bg-black|bg-white|text-white|border-white)(?:\/(?:\d+|\[[^\]]+\]))?\b/u.test(
              line,
            ) && !line.includes('design-system-allow-content-color'),
        );

      expect(unmarkedLines).toEqual([]);
    },
  );

  it.each(CARD_MIGRATION_SOURCES)(
    'uses the shared Card for semantic card surfaces in %s',
    (relativePath) => {
      const source = readSource(relativePath);

      expect(source).toContain("import Card from '@ui/card/Card'");
      expect(source).toContain('<Card');
    },
  );

  it.each(OVERLAY_MENU_SOURCES)(
    'uses the secondary overlay plane and dropdown elevation in %s',
    (relativePath) => {
      const source = readSource(relativePath);

      expect(source).toContain('bg-secondary');
      expect(source).toContain('shadow-dropdown');
    },
  );

  it.each(ICONIC_STATUS_SOURCES)(
    'uses labelled iconic status treatment instead of a generic colored dot in %s',
    (relativePath) => {
      const source = readSource(relativePath);

      expect(source).toContain('status=');
      expect(source).not.toMatch(/STATUS_DOT_CLASSES|getTaskStatusClass/u);
      expect(source).not.toMatch(
        /animate-pulse[^\n]*rounded-full[^\n]*bg-(?:blue|emerald|amber|success|warning|info)/u,
      );
      expect(source).not.toMatch(
        /rounded-full[^\n]*bg-(?:blue|emerald|amber|success|warning|info)[^\n]*\/>/u,
      );
    },
  );

  it.each(TASK_STATUS_SOURCES)(
    'uses the canonical labelled status Badge in %s',
    (relativePath) => {
      const source = readSource(relativePath);

      expect(source).toContain("import Badge from '@ui/display/badge/Badge'");
      expect(source).toContain('status=');
      expect(source).not.toContain('STATUS_COLORS');
      expect(source).not.toContain('statusColors');
    },
  );
});
