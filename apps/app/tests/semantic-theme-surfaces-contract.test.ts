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

const WORKFLOW_ROUTE_SOURCES = [
  'app/(protected)/[orgSlug]/[brandSlug]/automation/workflows/[id]/WorkflowDetailPageClient.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/automation/workflows/new/WorkflowNewPageClient.tsx',
] as const;

const APP_PRODUCT_SOURCES = [
  ...collectSourceFiles('app'),
  ...collectSourceFiles('packages'),
  ...collectSourceFiles('src'),
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
  'app/(protected)/[orgSlug]/[brandSlug]/tasks/task-pills.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/tasks/[id]/issue-header.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/tasks/[id]/issue-sidebar.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/tasks/[id]/sub-issue-row.tsx',
] as const;

describe('semantic theme surface contracts', () => {
  it('uses the foreground token for the onboarding loading indicator', () => {
    const source = readSource('app/(onboarding)/onboarding/(wizard)/page.tsx');

    expect(source).not.toContain('border-t-white');
    expect(source).toContain('<Spinner');
    expect(source).toContain('text-foreground');
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

  it('uses semantic CSS colors for library canvas navigation chrome', () => {
    const source = readSource(
      '../../packages/ui/src/components/ingredients/canvas/LibraryCanvas.tsx',
    );

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
    expect(source).toContain('hsl(var(--foreground) / 0.1)');
    expect(source).toContain('hsl(var(--background) / 0.8)');
  });

  // Batch projects list through `ListRow`s inside a `CollectionList`: each row
  // draws its own theme-token divider and drops it on the last child, so a row
  // must be a direct list child (a wrapper would make every row "last").
  it('uses the theme border token for batch job dividers', () => {
    const page = readSource(
      'src/features/workflows/pages/batch/BatchProjectsPage.tsx',
    );
    const listRow = readSource(
      '../../packages/ui/src/components/lists/list-row/ListRow.tsx',
    );

    expect(page).not.toMatch(/\b(?:divide|border)-white\b/u);
    expect(page).toContain('<CollectionList>');
    expect(page).toContain('<ListRow');
    expect(page).toContain(
      '<Fragment key={project.id}>{row(project)}</Fragment>',
    );
    expect(listRow).toContain('border-b border-border');
    expect(listRow).toContain('last:border-b-0');
    expect(listRow).not.toMatch(/\b(?:divide|border)-white\b/u);
  });

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
