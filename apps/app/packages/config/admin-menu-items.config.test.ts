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

  it('makes each named admin section collapsible (first item of the group)', () => {
    const firstByGroup = new Map<string, (typeof ADMIN_MENU_ITEMS)[number]>();
    for (const item of ADMIN_MENU_ITEMS) {
      const group = item.group ?? '';
      if (group && !firstByGroup.has(group)) {
        firstByGroup.set(group, item);
      }
    }

    expect(firstByGroup.size).toBeGreaterThan(0);
    for (const [group, item] of firstByGroup) {
      expect(item.isCollapsible, group).toBe(true);
    }
  });
});
