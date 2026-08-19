import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
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
  'app/(protected)/[orgSlug]/[brandSlug]/automate/workflows/[id]/WorkflowDetailPageClient.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/automate/workflows/new/WorkflowNewPageClient.tsx',
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
});
