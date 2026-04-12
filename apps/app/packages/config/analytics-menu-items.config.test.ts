import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_LOGO_HREF,
  ANALYTICS_MENU_ITEMS,
} from './analytics-menu-items.config';

describe('ANALYTICS_MENU_ITEMS', () => {
  it('is non-empty', () => {
    expect(ANALYTICS_MENU_ITEMS.length).toBeGreaterThan(0);
  });

  it('has a logo href set', () => {
    expect(ANALYTICS_LOGO_HREF).toBeTruthy();
  });

  it('has no duplicate hrefs', () => {
    const hrefs = ANALYTICS_MENU_ITEMS.map((item) => item.href).filter(Boolean);
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

  it('all hrefs point to /analytics/* routes', () => {
    for (const item of ANALYTICS_MENU_ITEMS) {
      expect(item.href).toMatch(/^\/analytics\//);
    }
  });
});
