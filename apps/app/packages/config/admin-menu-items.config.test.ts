import {
  ADMIN_RAIL_CATEGORIES,
  getActiveAppId,
} from '@ui/shell/app-rail/app-rail.registry';
import { describe, expect, it } from 'vitest';
import { ADMIN_MENU_ITEMS } from './admin-menu-items.config';

describe('ADMIN_MENU_ITEMS', () => {
  it('exposes the platform admin surface with dashboard as complete-path home', () => {
    expect(ADMIN_MENU_ITEMS[0]?.href).toBe('/admin/overview/dashboard');
    expect(
      ADMIN_MENU_ITEMS.every((item) => item.href.startsWith('/admin')),
    ).toBe(true);
    expect(ADMIN_MENU_ITEMS.some((item) => item.href === '/admin')).toBe(false);
    expect(
      ADMIN_MENU_ITEMS.some((item) => item.href === '/admin/overview'),
    ).toBe(false);
    expect(ADMIN_MENU_ITEMS.some((item) => item.label === 'Agent')).toBe(false);
  });

  it('keeps CRM and marketplace surfaces out of the public app admin menu', () => {
    const hrefs = ADMIN_MENU_ITEMS.map((item) => item.href);

    expect(hrefs.some((href) => href.startsWith('/admin/crm'))).toBe(false);
    expect(hrefs.some((href) => href.startsWith('/admin/marketplace'))).toBe(
      false,
    );
  });

  it('includes cross-org cloud management destinations', () => {
    const hrefs = ADMIN_MENU_ITEMS.map((item) => item.href);

    expect(hrefs).toContain('/admin/overview/analytics/organizations');
    expect(hrefs).not.toContain('/admin/organization');
    expect(hrefs).toContain('/admin/administration/users');
    expect(hrefs).toContain('/admin/administration/warmup-accounts');
    expect(hrefs).toContain('/admin/administration/subscriptions');
    expect(hrefs).toContain('/admin/administration/system-emails');
    expect(hrefs).toContain('/admin/overview/analytics/all');
    expect(hrefs).toContain('/admin/content/generations');
  });

  it('keeps management destinations directly visible in the admin sidebar', () => {
    expect(ADMIN_MENU_ITEMS).not.toContainEqual(
      expect.objectContaining({ drillDown: true }),
    );
  });

  it('marks every admin nav item as global so hrefs stay under /admin', () => {
    expect(ADMIN_MENU_ITEMS.every((item) => item.hrefScope === 'global')).toBe(
      true,
    );
    expect(ADMIN_MENU_ITEMS.some((item) => item.href.includes('/crm/'))).toBe(
      false,
    );
  });

  it('leaves category grouping to the rail: no collapsible headers', () => {
    expect(ADMIN_MENU_ITEMS.some((item) => item.isCollapsible)).toBe(false);
  });

  it('gives every menu group a rail category icon, and no other', () => {
    const groups = new Set(ADMIN_MENU_ITEMS.map((item) => item.group));
    const categories = new Set(
      ADMIN_RAIL_CATEGORIES.map((category) => category.adminMenuGroup),
    );
    expect(categories).toEqual(groups);
  });

  it('opens each category on a page that belongs to it', () => {
    for (const category of ADMIN_RAIL_CATEGORIES) {
      const home = category.route('acme');
      const owner = ADMIN_MENU_ITEMS.find((item) => item.href === home);
      expect(owner?.group, category.id).toBe(category.adminMenuGroup);
    }
  });

  it('resolves every menu item to its own category on the rail', () => {
    for (const item of ADMIN_MENU_ITEMS) {
      const category = ADMIN_RAIL_CATEGORIES.find(
        ({ id }) => id === getActiveAppId(ADMIN_RAIL_CATEGORIES, item.href),
      );
      expect(category?.adminMenuGroup, item.label).toBe(item.group);
    }
  });
});
