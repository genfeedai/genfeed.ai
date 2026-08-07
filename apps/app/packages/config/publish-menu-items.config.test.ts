import { describe, expect, it } from 'vitest';
import {
  PUBLISH_LOGO_HREF,
  PUBLISH_MENU_ITEMS,
} from './publish-menu-items.config';

describe('PUBLISH_MENU_ITEMS', () => {
  it('is non-empty', () => {
    expect(PUBLISH_MENU_ITEMS.length).toBeGreaterThan(0);
  });

  it('has a logo href set to complete-path overview home', () => {
    expect(PUBLISH_LOGO_HREF).toBe('/publish/overview');
  });

  it('leads with Overview, not bare module root', () => {
    expect(PUBLISH_MENU_ITEMS[0]?.label).toBe('Overview');
    expect(PUBLISH_MENU_ITEMS[0]?.href).toBe('/publish/overview');
    expect(PUBLISH_MENU_ITEMS.map((item) => item.href)).not.toContain(
      '/publish',
    );
  });

  it('has no duplicate hrefs', () => {
    const hrefs = PUBLISH_MENU_ITEMS.flatMap((item) =>
      item.href ? [item.href] : [],
    );
    const unique = new Set(hrefs);

    expect(hrefs.length).toBe(unique.size);
  });

  it('all items have required fields: label, href, outline, solid', () => {
    for (const item of PUBLISH_MENU_ITEMS) {
      expect(item.label).toBeTruthy();
      expect(item.href).toBeTruthy();
      expect(item.outline).toBeDefined();
      expect(item.solid).toBeDefined();
    }
  });

  // The root list collapsed onto the surface root, so /publish is a valid href
  // alongside the /publish/* leaves. No item may fall back to the retired
  // /posts segment.
  it('all hrefs stay on the publish surface', () => {
    for (const item of PUBLISH_MENU_ITEMS) {
      expect(item.href).toMatch(/^\/publish(?:\/|$)/);
    }
  });

  it('owns no analytics destination', () => {
    const hrefs = PUBLISH_MENU_ITEMS.map((item) => item.href);
    const labels = PUBLISH_MENU_ITEMS.map((item) => item.label);

    expect(hrefs).not.toContain('/publish/analytics');
    expect(labels).not.toContain('Analytics');
  });
});
