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
});
