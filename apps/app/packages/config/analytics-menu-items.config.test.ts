import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_MENU_ITEMS,
  getAnalyticsMenuItemsForScope,
  isOrgAnalyticsRouteScope,
} from './analytics-menu-items.config';

/**
 * `/analytics` re-exports `./overview/page`, so the physical `overview`
 * directory is the canonical landing rather than a separate destination.
 */

/** Direct `/analytics/<segment>` children that ship a page of their own. */

describe('ANALYTICS_MENU_ITEMS', () => {
  // Overview collapsed onto the surface root, so /analytics is a valid href
  // alongside the /analytics/* leaves.

  it('keeps Intelligence as the only named group (no stacked Performance header)', () => {
    const groups = [...new Set(ANALYTICS_MENU_ITEMS.map((item) => item.group))];

    expect(groups).toEqual(['', 'Intelligence']);
    expect(groups).not.toContain('Performance');
    expect(groups).not.toContain('Habits');
  });

  it('treats empty and tilde brand slugs as org analytics scope', () => {
    expect(isOrgAnalyticsRouteScope('')).toBe(true);
    expect(isOrgAnalyticsRouteScope('~')).toBe(true);
    expect(isOrgAnalyticsRouteScope('default')).toBe(false);
  });

  it('hides brand-only analytics destinations on org scope', () => {
    const orgItems = getAnalyticsMenuItemsForScope('~');
    expect(orgItems.map((item) => item.label)).toEqual([
      'Overview',
      'Accounts',
      'Outliers',
    ]);
    expect(orgItems.some((item) => item.href === '/analytics/posts')).toBe(
      false,
    );
    expect(
      orgItems
        .filter((item) => item.label !== 'Outliers')
        .every((item) => !item.group),
    ).toBe(true);

    const brandItems = getAnalyticsMenuItemsForScope('default');
    expect(brandItems.length).toBe(ANALYTICS_MENU_ITEMS.length);
    expect(brandItems.some((item) => item.group === 'Intelligence')).toBe(true);
    expect(brandItems.some((item) => item.group === 'Performance')).toBe(false);
  });
});
