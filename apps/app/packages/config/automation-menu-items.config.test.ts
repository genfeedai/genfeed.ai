import { describe, expect, it } from 'vitest';
import { AUTOMATION_MENU_ITEMS } from './automation-menu-items.config';

describe('AUTOMATION_MENU_ITEMS', () => {
  it.each([
    ['Agents', '/automation/agents'],
    ['Programs', '/automation/campaigns'],
    ['Runs', '/automation/runs'],
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

  it('does not keep an Autopilot nav row or path alias', () => {
    const agents = AUTOMATION_MENU_ITEMS.find(
      (item) => item.label === 'Agents',
    );

    expect(
      AUTOMATION_MENU_ITEMS.some((item) => item.label === 'Autopilot'),
    ).toBe(false);
    expect(agents?.matchPaths).toEqual(['/automation/agents']);
    expect(
      AUTOMATION_MENU_ITEMS.some((item) =>
        item.matchPaths?.includes('/automation/autopilot'),
      ),
    ).toBe(false);
    expect(
      AUTOMATION_MENU_ITEMS.some(
        (item) =>
          item.href === '/automation/strategies' ||
          item.matchPaths?.includes('/automation/strategies'),
      ),
    ).toBe(false);
  });

  it.each([
    '/automation/campaigns',
    '/automation/content-runs',
    '/automation/templates',
    '/automation/workflows/new',
    '/automation/workflows/templates',
  ])('leaves no menu-less orphan page at %s', (orphanCandidate) => {
    const isCovered = AUTOMATION_MENU_ITEMS.some((item) =>
      item.matchPaths?.includes(orphanCandidate),
    );

    expect(isCovered).toBe(true);
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
});
