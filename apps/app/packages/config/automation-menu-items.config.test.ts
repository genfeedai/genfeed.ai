import { describe, expect, it } from 'vitest';
import { AUTOMATION_MENU_ITEMS } from './automation-menu-items.config';

describe('AUTOMATION_MENU_ITEMS', () => {
  it('is non-empty', () => {
    expect(AUTOMATION_MENU_ITEMS.length).toBeGreaterThan(0);
  });

  it('has no duplicate hrefs', () => {
    const hrefs = AUTOMATION_MENU_ITEMS.flatMap((item) =>
      item.href ? [item.href] : [],
    );
    const unique = new Set(hrefs);

    expect(hrefs.length).toBe(unique.size);
  });

  it('all items have required fields: label, href, outline, solid', () => {
    for (const item of AUTOMATION_MENU_ITEMS) {
      expect(item.label).toBeTruthy();
      expect(item.href).toBeTruthy();
      expect(item.outline).toBeDefined();
      expect(item.solid).toBeDefined();
    }
  });

  it('uses a unique lucide icon per row (no repeated glyphs)', () => {
    const iconNames = AUTOMATION_MENU_ITEMS.map(
      (item) => item.outline?.displayName ?? item.outline?.name,
    );
    expect(iconNames.every(Boolean)).toBe(true);
    expect(new Set(iconNames).size).toBe(iconNames.length);
  });

  it.each([
    ['Autopilot', '/automation/autopilot'],
    ['Agents', '/automation/agents'],
    ['Programs', '/automation/campaigns'],
    ['Runs', '/automation/runs'],
    ['Templates', '/automation/templates'],
    ['Workflows', '/automation/workflows'],
  ])('uses the canonical automation route for %s', (label, canonicalHref) => {
    const item = AUTOMATION_MENU_ITEMS.find(
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
      AUTOMATION_MENU_ITEMS.some((item) =>
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
      AUTOMATION_MENU_ITEMS.some(
        (item) =>
          item.href?.includes('outreach') ||
          item.href?.includes('reply') ||
          item.href?.includes('messages'),
      ),
    ).toBe(false);
  });

  it('does not keep a Strategies nav alias', () => {
    const autopilot = AUTOMATION_MENU_ITEMS.find(
      (item) => item.label === 'Autopilot',
    );

    expect(autopilot?.href).toBe('/automation/autopilot');
    expect(autopilot?.matchPaths).toEqual(['/automation/autopilot']);
    expect(
      AUTOMATION_MENU_ITEMS.some(
        (item) =>
          item.href === '/automation/strategies' ||
          item.matchPaths?.includes('/automation/strategies'),
      ),
    ).toBe(false);
  });

  it('does not host a duplicate Analytics surface (measurement lives in Analytics app)', () => {
    expect(
      AUTOMATION_MENU_ITEMS.some((item) => item.label === 'Analytics'),
    ).toBe(false);
    expect(
      AUTOMATION_MENU_ITEMS.some(
        (item) => item.href === '/automation/analytics',
      ),
    ).toBe(false);
  });

  it('routes every item under the automation prefix', () => {
    for (const item of AUTOMATION_MENU_ITEMS) {
      expect(item.href?.startsWith('/automation')).toBe(true);

      for (const matchPath of item.matchPaths ?? []) {
        expect(matchPath.startsWith('/automation')).toBe(true);
      }
    }
  });

  it.each([
    '/automation/campaigns',
    '/automation/content-runs',
    '/automation/templates',
    '/automation/workflows/new',
    '/automation/autopilot',
  ])('leaves no menu-less orphan page at %s', (orphanCandidate) => {
    const isCovered = AUTOMATION_MENU_ITEMS.some((item) =>
      item.matchPaths?.includes(orphanCandidate),
    );

    expect(isCovered).toBe(true);
  });

  it('groups by usage (Workflows / Agents) — no legacy Settings group', () => {
    const byGroup = new Map<string, string[]>();
    for (const item of AUTOMATION_MENU_ITEMS) {
      const group = item.group ?? '';
      const labels = byGroup.get(group) ?? [];
      labels.push(item.label);
      byGroup.set(group, labels);
    }

    expect(byGroup.get('')).toEqual(['Overview']);
    expect(byGroup.get('Workflows')).toEqual([
      'Workflows',
      'Templates',
      'Runs',
    ]);
    expect(byGroup.get('Agents')).toEqual(['Agents', 'Autopilot', 'Programs']);
    expect(byGroup.get('Campaigns')).toBeUndefined();
    expect(byGroup.get('Settings')).toBeUndefined();
    expect(byGroup.get('Build')).toBeUndefined();
    expect(byGroup.get('Insights')).toBeUndefined();
  });

  it('keeps automation configuration in Settings, not the Automation sidebar', () => {
    expect(
      AUTOMATION_MENU_ITEMS.some((item) =>
        ['Configuration', 'Skills'].includes(item.label),
      ),
    ).toBe(false);
  });

  it('matches the canonical Agents route', () => {
    const agents = AUTOMATION_MENU_ITEMS.find(
      (item) => item.label === 'Agents',
    );
    expect(agents?.matchPaths).not.toEqual(
      expect.arrayContaining(['/automation/orchestrator']),
    );
    expect(agents?.matchPaths).toEqual(
      expect.arrayContaining(['/automation/agents']),
    );
    expect(AUTOMATION_MENU_ITEMS.some((item) => item.label === 'Hire')).toBe(
      false,
    );
  });

  it('matches the canonical Program routes', () => {
    const programs = AUTOMATION_MENU_ITEMS.find(
      (item) => item.label === 'Programs',
    );

    expect(programs?.matchPaths).toEqual(
      expect.arrayContaining([
        '/automation/campaigns',
        '/automation/campaigns/new',
      ]),
    );
    expect(
      AUTOMATION_MENU_ITEMS.some((item) => item.label === 'Launch team'),
    ).toBe(false);
  });
});
