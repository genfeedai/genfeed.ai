import {
  ADMIN_RAIL_CATEGORIES,
  getActiveAppId,
} from '@ui/shell/app-rail/app-rail.registry';
import { describe, expect, it } from 'vitest';
import {
  ADMIN_MENU_ITEMS,
  withCollapsibleAdminGroups,
} from './admin-menu-items.config';

describe('ADMIN_MENU_ITEMS', () => {
  it('exposes the platform admin surface with dashboard as complete-path home', () => {
    expect(ADMIN_MENU_ITEMS[0]?.href).toBe('/admin/overview');
    expect(
      ADMIN_MENU_ITEMS.every((item) => item.href.startsWith('/admin')),
    ).toBe(true);
    expect(ADMIN_MENU_ITEMS.some((item) => item.href === '/admin')).toBe(false);
    expect(
      ADMIN_MENU_ITEMS.some((item) => item.href === '/admin/overview'),
    ).toBe(false);
    expect(
      ADMIN_MENU_ITEMS.some(
        (item) => item.label === 'Agent' && item.category !== 'admin-platform',
      ),
    ).toBe(false);
  });

  it('lights Overview only on its own pages, not on every /admin route', () => {
    const overview = ADMIN_MENU_ITEMS[0];

    expect(overview?.isExactMatch).toBe(true);
    expect(overview?.matchPaths).toContain('/admin');
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
    expect(hrefs).not.toContain('/admin/organizations');
    expect(hrefs).toContain('/admin/administration/learning');
    expect(hrefs).toContain('/admin/library/voices');
    expect(hrefs).toContain('/admin/administration/users');
    expect(hrefs).toContain('/admin/administration/concierge-accounts');
    expect(hrefs).toContain('/admin/administration/subscriptions');
    expect(hrefs).toContain('/admin/administration/system-emails');
    expect(hrefs).toContain('/admin/overview/analytics/all');
    expect(hrefs).toContain('/admin/content/generations');
    expect(hrefs).toContain('/admin/automation/agents');
  });

  it('lists prompts inside Generations instead of as their own page', () => {
    expect(
      ADMIN_MENU_ITEMS.some((item) =>
        item.href?.startsWith('/admin/content/prompts'),
      ),
    ).toBe(false);
    expect(ADMIN_MENU_ITEMS.some((item) => item.label === 'Prompts')).toBe(
      false,
    );
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

  it('has no dead links: every page exists and none is listed twice', () => {
    const hrefs = ADMIN_MENU_ITEMS.map((item) => item.href);

    expect(hrefs).not.toContain('/admin/economics/coverage');
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('gives every category a rail icon, and every rail icon a category', () => {
    const categories = new Set(ADMIN_MENU_ITEMS.map((item) => item.category));
    expect(categories).toEqual(
      new Set(ADMIN_RAIL_CATEGORIES.map((category) => category.id)),
    );
  });

  it('keeps the pages of one group adjacent so the sidebar shows one header each', () => {
    for (const category of ADMIN_RAIL_CATEGORIES) {
      const groups = ADMIN_MENU_ITEMS.filter(
        (item) => item.category === category.id,
      ).map((item) => item.group ?? '');
      const runs = groups.filter((group, index) => group !== groups[index - 1]);
      expect(new Set(runs).size, category.id).toBe(runs.length);
    }
  });

  it('opens each category on a page that belongs to it', () => {
    for (const category of ADMIN_RAIL_CATEGORIES) {
      const home = category.route('acme');
      const owner = ADMIN_MENU_ITEMS.find((item) => item.href === home);
      expect(owner?.category, category.id).toBe(category.id);
    }
  });

  it('resolves every menu item to its own category on the rail', () => {
    for (const item of ADMIN_MENU_ITEMS) {
      expect(getActiveAppId(ADMIN_RAIL_CATEGORIES, item.href), item.label).toBe(
        item.category,
      );
    }
  });

  it('makes each group header collapsible through its first item only', () => {
    const items = withCollapsibleAdminGroups(
      ADMIN_MENU_ITEMS.filter((item) => item.category === 'admin-platform'),
    );
    const groups = [...new Set(items.map((item) => item.group))];

    for (const group of groups) {
      const inGroup = items.filter((item) => item.group === group);
      expect(inGroup[0]?.isCollapsible).toBe(true);
      expect(inGroup.slice(1).some((item) => item.isCollapsible)).toBe(false);
    }
  });

  it('leaves items without a group flat', () => {
    const [overview] = withCollapsibleAdminGroups(ADMIN_MENU_ITEMS);

    expect(overview?.group).toBeUndefined();
    expect(overview?.isCollapsible).toBeUndefined();
  });
});
