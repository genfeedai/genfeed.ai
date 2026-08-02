import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_LOGO_HREF,
  ANALYTICS_MENU_ITEMS,
} from './analytics-menu-items.config';

const ANALYTICS_APP_DIRECTORY =
  'apps/app/app/(protected)/[orgSlug]/[brandSlug]/analytics';

/**
 * `/analytics` re-exports `./overview/page`, so the physical `overview`
 * directory is the canonical landing rather than a separate destination.
 */
const CANONICAL_ROOT_ALIASES = new Set(['overview']);

function findRepoRoot(startDirectory: string): string {
  let currentDirectory = startDirectory;

  while (currentDirectory !== dirname(currentDirectory)) {
    if (existsSync(join(currentDirectory, ANALYTICS_APP_DIRECTORY))) {
      return currentDirectory;
    }

    currentDirectory = dirname(currentDirectory);
  }

  throw new Error(`Unable to find repo root from ${startDirectory}`);
}

/** Direct `/analytics/<segment>` children that ship a page of their own. */
function collectTopLevelAnalyticsSegments(): string[] {
  const analyticsDirectory = join(
    findRepoRoot(process.cwd()),
    ANALYTICS_APP_DIRECTORY,
  );

  return readdirSync(analyticsDirectory, { withFileTypes: true })
    .flatMap((entry) => {
      if (
        !entry.isDirectory() ||
        entry.name.startsWith('_') ||
        entry.name.startsWith('[')
      ) {
        return [];
      }

      return existsSync(join(analyticsDirectory, entry.name, 'page.tsx'))
        ? [entry.name]
        : [];
    })
    .sort();
}

function labelsInGroup(group: string): string[] {
  return ANALYTICS_MENU_ITEMS.filter((item) => item.group === group).map(
    (item) => item.label,
  );
}

describe('ANALYTICS_MENU_ITEMS', () => {
  it('is non-empty', () => {
    expect(ANALYTICS_MENU_ITEMS.length).toBeGreaterThan(0);
  });

  it('has a logo href set', () => {
    expect(ANALYTICS_LOGO_HREF).toBeTruthy();
  });

  it('has no duplicate hrefs', () => {
    const hrefs = ANALYTICS_MENU_ITEMS.flatMap((item) =>
      item.href ? [item.href] : [],
    );
    const unique = new Set(hrefs);

    expect(hrefs.length).toBe(unique.size);
  });

  it('all items have required fields: label, href, outline, solid', () => {
    for (const item of ANALYTICS_MENU_ITEMS) {
      expect(item.label).toBeTruthy();
      expect(item.href).toBeTruthy();
      expect(item.outline).toBeDefined();
      expect(item.solid).toBeDefined();
    }
  });

  // Overview collapsed onto the surface root, so /analytics is a valid href
  // alongside the /analytics/* leaves.
  it('all hrefs stay on the analytics surface', () => {
    for (const item of ANALYTICS_MENU_ITEMS) {
      expect(item.href).toMatch(/^\/analytics(?:\/|$)/);
    }
  });

  it('groups every item under Performance, Intelligence, or Habits', () => {
    const groups = [...new Set(ANALYTICS_MENU_ITEMS.map((item) => item.group))];

    expect(groups).toEqual(['Performance', 'Intelligence', 'Habits']);
  });

  it('puts what-happened destinations under Performance', () => {
    expect(labelsInGroup('Performance')).toEqual([
      'Overview',
      'Posts',
      'Brands',
    ]);
  });

  it('puts derived analysis destinations under Intelligence', () => {
    expect(labelsInGroup('Intelligence')).toEqual([
      'Insights',
      'Hooks',
      'Performance Lab',
      'Trends',
      'Trend Turnover',
    ]);
  });

  it('puts consistency destinations under Habits', () => {
    expect(labelsInGroup('Habits')).toEqual(['Streaks']);
  });

  it('gives every item a unique icon', () => {
    const outlineIcons = ANALYTICS_MENU_ITEMS.map((item) => item.outline);
    const solidIcons = ANALYTICS_MENU_ITEMS.map((item) => item.solid);

    expect(new Set(outlineIcons).size).toBe(outlineIcons.length);
    expect(new Set(solidIcons).size).toBe(solidIcons.length);
  });

  it('exposes trends behind a nav entry', () => {
    // Regression guard for the orphaned `/analytics/trends` route: the page,
    // its drilldowns, and the workspace-shell breadcrumbs existed, but nothing
    // linked to it.
    expect(ANALYTICS_MENU_ITEMS.map((item) => item.href)).toContain(
      '/analytics/trends',
    );
  });

  it('exposes every analytics page behind a nav entry', () => {
    const hrefs = new Set(ANALYTICS_MENU_ITEMS.map((item) => item.href));
    const unreachableSegments = collectTopLevelAnalyticsSegments().filter(
      (segment) =>
        !CANONICAL_ROOT_ALIASES.has(segment) &&
        !hrefs.has(`/analytics/${segment}`),
    );

    expect(unreachableSegments).toEqual([]);
  });

  it('keeps the analytics landing reachable from the menu', () => {
    expect(ANALYTICS_MENU_ITEMS.map((item) => item.href)).toContain(
      '/analytics',
    );
  });
});
