import { describe, expect, it } from 'vitest';
import {
  AUTOMATE_LOGO_HREF,
  AUTOMATE_MENU_ITEMS,
} from './automate-menu-items.config';

describe('AUTOMATE_MENU_ITEMS', () => {
  it('is non-empty', () => {
    expect(AUTOMATE_MENU_ITEMS.length).toBeGreaterThan(0);
    expect(AUTOMATE_LOGO_HREF).toBe('/automate/overview');
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

  it('uses a unique lucide icon per row (no repeated glyphs)', () => {
    const iconNames = AUTOMATE_MENU_ITEMS.map(
      (item) => item.outline?.displayName ?? item.outline?.name,
    );
    expect(iconNames.every(Boolean)).toBe(true);
    expect(new Set(iconNames).size).toBe(iconNames.length);
  });

  it.each([
    ['Autopilot', '/automate/autopilot'],
    ['Configuration', '/automate/configuration'],
    ['Team', '/automate/library'],
    ['Hire', '/automate/hire'],
    ['Programs', '/automate/campaigns'],
    ['Launch team', '/automate/orchestrator'],
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

  it('does not host outreach or reply surfaces (those live in Messages)', () => {
    expect(
      AUTOMATE_MENU_ITEMS.some((item) =>
        [
          'Outreach',
          'Outreach sequences',
          'Replies',
          'Reply Campaigns',
          'Reply drip',
          'Campaigns',
        ].includes(item.label),
      ),
    ).toBe(false);
    expect(
      AUTOMATE_MENU_ITEMS.some(
        (item) =>
          item.href?.includes('outreach') ||
          item.href?.includes('reply') ||
          item.href?.includes('messages'),
      ),
    ).toBe(false);
  });

  it('does not keep a Strategies nav alias', () => {
    const autopilot = AUTOMATE_MENU_ITEMS.find(
      (item) => item.label === 'Autopilot',
    );

    expect(autopilot?.href).toBe('/automate/autopilot');
    expect(autopilot?.matchPaths).toEqual(['/automate/autopilot']);
    expect(
      AUTOMATE_MENU_ITEMS.some(
        (item) =>
          item.href === '/automate/strategies' ||
          item.matchPaths?.includes('/automate/strategies'),
      ),
    ).toBe(false);
  });

  it('does not host a duplicate Analytics surface (measurement lives in Analytics app)', () => {
    expect(AUTOMATE_MENU_ITEMS.some((item) => item.label === 'Analytics')).toBe(
      false,
    );
    expect(
      AUTOMATE_MENU_ITEMS.some((item) => item.href === '/automate/analytics'),
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
    '/automate/campaigns',
    '/automate/content-runs',
    '/automate/hire',
    '/automate/orchestrator',
    '/automate/new',
    '/automate/workflows/templates',
    '/automate/workflows/new',
    '/automate/autopilot',
  ])('leaves no menu-less orphan page at %s', (orphanCandidate) => {
    const isCovered = AUTOMATE_MENU_ITEMS.some((item) =>
      item.matchPaths?.includes(orphanCandidate),
    );

    expect(isCovered).toBe(true);
  });

  it('groups by usage (Workflows / Agents / Settings) — no Campaigns group', () => {
    const byGroup = new Map<string, string[]>();
    for (const item of AUTOMATE_MENU_ITEMS) {
      const group = item.group ?? '';
      const labels = byGroup.get(group) ?? [];
      labels.push(item.label);
      byGroup.set(group, labels);
    }

    expect(byGroup.get('')).toEqual(['Overview']);
    expect(byGroup.get('Workflows')).toEqual(['Workflows', 'Runs']);
    expect(byGroup.get('Agents')).toEqual([
      'Team',
      'Hire',
      'Skills',
      'Autopilot',
      'Programs',
      'Launch team',
    ]);
    expect(byGroup.get('Campaigns')).toBeUndefined();
    expect(byGroup.get('Settings')).toEqual(['Configuration']);
    expect(byGroup.get('Build')).toBeUndefined();
    expect(byGroup.get('Insights')).toBeUndefined();
  });

  it('does not bury Hire or Launch team under Team matchPaths', () => {
    const team = AUTOMATE_MENU_ITEMS.find((item) => item.label === 'Team');
    expect(team?.matchPaths).not.toEqual(
      expect.arrayContaining(['/automate/hire', '/automate/orchestrator']),
    );
    expect(team?.matchPaths).toEqual(
      expect.arrayContaining(['/automate/library', '/automate/new']),
    );
  });
});
