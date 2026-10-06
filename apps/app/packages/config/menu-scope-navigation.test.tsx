import { getAnalyticsMenuItemsForScope } from '@app-config/analytics-menu-items.config';
import { getMessagesMenuItemsForScope } from '@app-config/messages-menu-items.config';
import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import { renderHook } from '@testing-library/react';
import { useMenuShared } from '@ui/menus/shared/useMenuShared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const route = vi.hoisted(() => ({
  pathname: '/genfeed/genfeedai/analytics/overview',
  selectedBrand: { organization: { slug: 'genfeed' }, slug: 'stale-brand' },
}));

vi.mock('next/navigation', () => ({
  // The shell lives above the dynamic route layouts, so params may be empty.
  useParams: () => ({}),
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ selectedBrand: route.selectedBrand }),
}));

vi.mock('@genfeedai/contexts/ui/sidebar-navigation-context', () => ({
  useSidebarNavigation: () => ({
    enterNestedGroup: vi.fn(),
    exitNestedGroup: vi.fn(),
    nestedGroupId: null,
  }),
}));

vi.mock('@genfeedai/hooks/ui/use-theme-logo/use-theme-logo', () => ({
  useThemeLogo: () => '',
}));

function useScopedMenu(items: MenuItemConfig[]) {
  return useMenuShared({ config: { items, logoHref: '/' } });
}

describe('shared menu destinations preserve the route scope', () => {
  beforeEach(() => {
    route.pathname = '/genfeed/genfeedai/analytics/overview';
    route.selectedBrand.slug = 'stale-brand';
  });

  const brandItems = [
    ...getAnalyticsMenuItemsForScope('genfeedai'),
    ...getMessagesMenuItemsForScope('genfeedai'),
  ];

  it.each(brandItems)(
    'keeps the URL brand and highlights $label ($href)',
    (item) => {
      route.pathname = `/genfeed/genfeedai${item.href}`;
      const { result } = renderHook(() => useScopedMenu(brandItems));

      expect(result.current.prefixHref(item)).toBe(route.pathname);
      expect(result.current.isActiveItem(item)).toBe(true);
    },
  );

  const orgItems = [
    ...getAnalyticsMenuItemsForScope('~'),
    ...getMessagesMenuItemsForScope('~'),
  ];

  it.each(orgItems)(
    'stays brandless and highlights $label ($href) on org routes',
    (item) => {
      route.pathname = `/genfeed/~${item.href}`;
      const { result } = renderHook(() => useScopedMenu(orgItems));

      expect(result.current.prefixHref(item)).toBe(route.pathname);
      expect(result.current.isActiveItem(item)).toBe(true);
    },
  );

  it('updates shared links when switching brands or clearing the brand', () => {
    const accounts = brandItems.find((item) => item.label === 'Accounts');
    expect(accounts).toBeDefined();
    if (!accounts) throw new Error('Accounts menu item missing');

    const { result, rerender } = renderHook(() => useScopedMenu(brandItems));
    expect(result.current.prefixHref(accounts)).toBe(
      '/genfeed/genfeedai/analytics/accounts',
    );

    route.pathname = '/genfeed/another-brand/analytics/accounts';
    rerender();
    expect(result.current.prefixHref(accounts)).toBe(route.pathname);
    expect(result.current.isActiveItem(accounts)).toBe(true);

    route.pathname = '/genfeed/~/analytics/accounts';
    rerender();
    expect(result.current.prefixHref(accounts)).toBe(route.pathname);
    expect(result.current.isActiveItem(accounts)).toBe(true);
  });
});
