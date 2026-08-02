import { describe, expect, it } from 'vitest';
import {
  AUTOMATE_LOGO_HREF,
  AUTOMATE_MENU_ITEMS,
} from './automate-menu-items.config';

describe('AUTOMATE_MENU_ITEMS', () => {
  it('is non-empty', () => {
    expect(AUTOMATE_MENU_ITEMS.length).toBeGreaterThan(0);
  });

  it("has a logo href pointing back to Automate's own overview", () => {
    expect(AUTOMATE_LOGO_HREF).toBe('/automate/overview');
  });

  it('has no duplicate hrefs', () => {
    const hrefs = AUTOMATE_MENU_ITEMS.flatMap((item) =>
      item.href ? [item.href] : [],
    );
    const unique = new Set(hrefs);

    expect(hrefs.length).toBe(unique.size);
  });

  it('all items have required fields: label, href, outline, solid', () => {
    for (const item of AUTOMATE_MENU_ITEMS) {
      expect(item.label).toBeTruthy();
      expect(item.href).toBeTruthy();
      expect(item.outline).toBeDefined();
      expect(item.solid).toBeDefined();
    }
  });

  it.each([
    ['Analytics', '/automate/analytics'],
    ['Autopilot', '/automate/autopilot'],
    ['Configuration', '/automate/configuration'],
    ['Team', '/automate/library'],
    ['Workflows', '/automate/workflows'],
  ])('uses the canonical automate route for %s', (label, canonicalHref) => {
    const item = AUTOMATE_MENU_ITEMS.find(
      (menuItem) => menuItem.label === label,
    );

    expect(item).toMatchObject({ href: canonicalHref });
    expect(item?.matchPaths).toEqual(expect.arrayContaining([canonicalHref]));
    expect(
      item?.matchPaths?.some((path) => path.startsWith('/workflows')),
    ).toBe(false);
  });

  it('routes every item under the automate prefix', () => {
    for (const item of AUTOMATE_MENU_ITEMS) {
      expect(item.href?.startsWith('/automate')).toBe(true);

      for (const matchPath of item.matchPaths ?? []) {
        expect(matchPath.startsWith('/automate')).toBe(true);
      }
    }
  });

  it.each([
    '/automate/content-runs',
    '/automate/hire',
    '/automate/orchestrator',
    '/automate/new',
    '/automate/workflows/templates',
    '/automate/workflows/new',
  ])('leaves no menu-less orphan page at %s', (orphanCandidate) => {
    const isCovered = AUTOMATE_MENU_ITEMS.some((item) =>
      item.matchPaths?.includes(orphanCandidate),
    );

    expect(isCovered).toBe(true);
  });

  it('groups product surfaces (Build / Campaigns / Agents / Insights / Settings)', () => {
    const byGroup = new Map<string, string[]>();
    for (const item of AUTOMATE_MENU_ITEMS) {
      const group = item.group ?? '';
      const labels = byGroup.get(group) ?? [];
      labels.push(item.label);
      byGroup.set(group, labels);
    }

    expect(byGroup.get('')).toEqual(['Overview']);
    expect(byGroup.get('Build')).toEqual(['Workflows', 'Runs']);
    expect(byGroup.get('Campaigns')).toEqual(['Reply Campaigns']);
    expect(byGroup.get('Agents')).toEqual(['Team', 'Skills', 'Autopilot']);
    expect(byGroup.get('Insights')).toEqual(['Analytics']);
    expect(byGroup.get('Settings')).toEqual(['Configuration']);
  });
});
