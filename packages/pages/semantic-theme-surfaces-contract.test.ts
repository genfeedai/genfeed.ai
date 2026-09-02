import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const PAGES_ROOT = import.meta.dirname;
const RAW_CHROME_PATTERN =
  /\b(?:text-white|bg-black|bg-white|text-black)(?:\/(?:\d+|\[[^\]]+\]))?\b/u;
const CONTENT_COLOR_ALLOW_MARKER = 'design-system-allow-content-color';

function readPage(relativePath: string): string {
  return readFileSync(join(PAGES_ROOT, relativePath), 'utf8');
}

function collectProductionSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectProductionSources(path);
    if (!/\.(?:ts|tsx)$/u.test(entry.name)) return [];
    if (/\.(?:spec|test|stories)\.(?:ts|tsx)$/u.test(entry.name)) return [];
    return [path];
  });
}

describe('page semantic theme surfaces', () => {
  it('documents every intentional fixed black/white content color inline', () => {
    const violations = collectProductionSources(PAGES_ROOT).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, index) => {
          if (line.includes(CONTENT_COLOR_ALLOW_MARKER)) return [];
          return RAW_CHROME_PATTERN.test(line)
            ? [`${relative(PAGES_ROOT, file)}:${index + 1}: ${line.trim()}`]
            : [];
        }),
    );

    expect(violations).toEqual([]);
  });

  it.each([
    [
      'analytics/overview/analytics-overview-placeholder-card.tsx',
      'bg-white/5',
      'bg-foreground/5',
    ],
    [
      'analytics/platform-detail/analytics-platform-detail.tsx',
      'bg-white/10',
      'bg-foreground/10',
    ],
    [
      'analytics/brand-overview/BrandKPISection.tsx',
      'bg-white/10',
      'bg-foreground/10',
    ],
    [
      'analytics/trends/trend-detail/trend-detail.tsx',
      'border-white',
      'border-border',
    ],
    [
      'analytics/trends/trend-detail/trend-detail-analysis-card.tsx',
      'border-white',
      'border-border',
    ],
    [
      'trends/platform-detail/components/related-metric-card.tsx',
      'border-white',
      'border-border',
    ],
    [
      'trends/list/components/HookRemixModal.tsx',
      'bg-white/[0.04]',
      'bg-foreground/[0.04]',
    ],
    [
      'posts/detail/components/PostDetailCardBody.tsx',
      'border-white',
      'border-border',
    ],
    ['posts/detail/PostDetailOverlay.tsx', 'border-white', 'border-border'],
    [
      'brands/components/sidebar/BrandDetailManualKitCard.tsx',
      'border-white',
      'border-border',
    ],
  ])(
    'removes fixed dark-only chrome from %s',
    (relativePath, forbiddenToken, semanticToken) => {
      const source = readPage(relativePath);

      expect(source).toContain(semanticToken);
      expect(source).not.toContain(forbiddenToken);
    },
  );

  it('themes the not-found application surface', () => {
    const source = readPage('not-found/not-found-page.tsx');

    expect(source).toContain('bg-background');
    expect(source).toContain('bg-primary');
    expect(source).toContain('text-primary-foreground');
    expect(source).not.toContain('bg-black');
    expect(source).not.toContain('bg-white');
    expect(source).not.toContain('text-black');
  });

  it('themes progress and loading indicators', () => {
    const streaks = readPage('streaks/streaks-page.tsx');
    const campaigns = readPage('agents/campaigns/AgentCampaignsPage.tsx');

    expect(streaks).toContain('border-t-foreground');
    expect(streaks).not.toContain('border-t-white');
    expect(campaigns).toContain('bg-foreground/[0.06]');
    expect(campaigns).not.toContain('border-white');
    expect(campaigns).not.toContain('bg-white');
  });

  it('themes campaign controls and platform icons', () => {
    const table = readPage('agents/campaigns/OutreachCampaignsTable.tsx');
    const header = readPage(
      'agents/campaigns/OutreachCampaignDetailHeader.tsx',
    );
    const wizard = readPage('agents/campaigns/OutreachCampaignWizardStep1.tsx');

    expect(table).not.toContain('text-slate');
    expect(header).not.toContain('text-slate');
    expect(wizard).toContain('border-border');
    expect(wizard).not.toContain('border-white');
  });

  it('uses semantic chrome around library preview media', () => {
    const source = readPage(
      'library/landing/library-landing-visual-preview.tsx',
    );

    expect(source).toContain('border-border bg-secondary');
    expect(source).toContain('text-muted-foreground');
    expect(source).not.toContain('border-white');
    expect(source).not.toContain('bg-white/[0.03]');
    expect(source).toContain('from-black/70');
    expect(source).toContain('text-white');
  });

  it('uses semantic borders in the Desk surfaces while preserving media canvases', () => {
    const sourcesMenu = readPage('trends/desk/desk-sources-menu.tsx');
    const lightTable = readPage('trends/desk/desk-light-table-view.tsx');

    expect(sourcesMenu).toContain('border-border');
    expect(sourcesMenu).toContain('divide-border');
    expect(sourcesMenu).not.toContain('border-white');
    expect(sourcesMenu).not.toContain('divide-white');
    expect(lightTable).toContain(
      'aspect-video w-full overflow-hidden bg-black',
    );
  });

  it('uses a semantic checkbox boundary in the follow-source picker', () => {
    const source = readPage('trends/following/FollowSourceModal.tsx');

    expect(source).toContain('!border-foreground/50');
    expect(source).not.toContain('!border-white');
  });

  it.each([
    'agents/campaigns/AgentCampaignsPage.tsx',
    'content-runs/detail/content-run-detail.tsx',
    'posts/list/components/PostsGrid.tsx',
    'trends/platform-detail/components/related-metric-card.tsx',
    'trends/shared/trend-content-card.tsx',
  ])('uses the shared Card for semantic card surfaces in %s', (path) => {
    const source = readPage(path);

    expect(source).toContain("import Card from '@ui/card/Card'");
    expect(source).toContain('<Card');
  });
});
