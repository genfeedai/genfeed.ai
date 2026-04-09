import { describe, expect, it } from 'vitest';
import { ADMIN_LOGO_HREF, ADMIN_MENU_ITEMS } from './admin-menu-items.config';

describe('ADMIN_MENU_ITEMS', () => {
  it('exposes the cloud superadmin surface under /admin', () => {
    expect(ADMIN_LOGO_HREF).toBe('/admin');
    expect(ADMIN_MENU_ITEMS[0]?.href).toBe('/admin/agent');
    expect(ADMIN_MENU_ITEMS.some((item) => item.href === '/admin')).toBe(true);
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

    expect(hrefs).toContain('/admin/organization');
    expect(hrefs).toContain('/admin/administration/users');
    expect(hrefs).toContain('/admin/administration/subscriptions');
    expect(hrefs).toContain('/admin/overview/analytics/all');
  });
});
