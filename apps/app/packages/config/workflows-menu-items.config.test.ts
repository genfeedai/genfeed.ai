import { describe, expect, it } from 'vitest';
import {
  WORKFLOWS_LOGO_HREF,
  WORKFLOWS_MENU_ITEMS,
} from './workflows-menu-items.config';

describe('WORKFLOWS_MENU_ITEMS', () => {
  it('is non-empty', () => {
    expect(WORKFLOWS_MENU_ITEMS.length).toBeGreaterThan(0);
  });

  it('has a logo href pointing back to the org overview', () => {
    expect(WORKFLOWS_LOGO_HREF).toBe('/overview');
  });

  it('has no duplicate hrefs', () => {
    const hrefs = WORKFLOWS_MENU_ITEMS.flatMap((item) =>
      item.href ? [item.href] : [],
    );
    const unique = new Set(hrefs);

    expect(hrefs.length).toBe(unique.size);
  });

  it('all items have required fields: label, href, outline, solid', () => {
    for (const item of WORKFLOWS_MENU_ITEMS) {
      expect(item.label).toBeTruthy();
      expect(item.href).toBeTruthy();
      expect(item.outline).toBeDefined();
      expect(item.solid).toBeDefined();
    }
  });

  it.each([
    ['Autopilot', '/orchestration/autopilot', '/workflows/autopilot'],
    [
      'Configuration',
      '/orchestration/configuration',
      '/workflows/configuration',
    ],
  ])('uses the canonical orchestration route for %s and only matches its legacy workflow alias', (label, canonicalHref, legacyHref) => {
    const item = WORKFLOWS_MENU_ITEMS.find(
      (menuItem) => menuItem.label === label,
    );

    expect(item).toMatchObject({ href: canonicalHref });
    expect(item?.matchPaths).toEqual(
      expect.arrayContaining([canonicalHref, legacyHref]),
    );
  });
});
