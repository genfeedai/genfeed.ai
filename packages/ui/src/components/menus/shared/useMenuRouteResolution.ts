import { createBrandAppRoute } from '@genfeedai/constants';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import { usePathname } from 'next/navigation';
import { useCallback, useMemo } from 'react';

type MenuHrefConfig = Pick<MenuItemConfig, 'href' | 'hrefScope'>;

export function useMenuRouteResolution() {
  const rawPathname = usePathname();
  const { href: brandHref, orgHref, orgSlug, brandSlug } = useOrgUrl();

  const routeScope = useMemo(() => {
    const parts = rawPathname.split('/').filter(Boolean);

    if (parts[0] === 'settings') {
      return 'personal' as const;
    }

    if (parts[1] === '~') {
      return 'organization' as const;
    }

    return 'brand' as const;
  }, [rawPathname]);

  const pathname = useMemo(() => {
    const parts = rawPathname.split('/').filter(Boolean);

    if (parts.length >= 2 && parts[1] === '~') {
      return `/${parts.slice(2).join('/')}`;
    }

    if (parts.length >= 3) {
      return `/${parts.slice(2).join('/')}`;
    }

    return rawPathname;
  }, [rawPathname]);

  const isAlreadyScopedHref = useCallback(
    (path: string) => {
      const parts = path.split('/').filter(Boolean);

      return (
        parts[0] === orgSlug &&
        (parts[1] === '~' || (brandSlug && parts[1] === brandSlug))
      );
    },
    [brandSlug, orgSlug],
  );

  const resolveSettingsHref = useCallback(
    (path: string) => {
      if (path === '/settings/personal') {
        return '/settings';
      }

      if (path.startsWith('/settings/brands/')) {
        const [, , , routeBrandSlug, ...rest] = path.split('/');

        if (routeBrandSlug) {
          const suffix = rest.length > 0 ? `/${rest.join('/')}` : '';
          return createBrandAppRoute(
            orgSlug,
            routeBrandSlug,
            `/settings${suffix}`,
          );
        }
      }

      return orgHref(path);
    },
    [orgHref, orgSlug],
  );

  const prefixHref = useCallback(
    (item: MenuHrefConfig) => {
      const path = item.href;

      if (!path) {
        return undefined;
      }

      if (isAlreadyScopedHref(path)) {
        return path;
      }

      if (item.hrefScope === 'global' || item.hrefScope === 'personal') {
        return path;
      }

      if (item.hrefScope === 'organization') {
        return orgHref(path);
      }

      if (item.hrefScope === 'brand') {
        return brandHref(path);
      }

      if (path.startsWith('/settings')) {
        return resolveSettingsHref(path);
      }

      return brandHref(path);
    },
    [brandHref, isAlreadyScopedHref, orgHref, resolveSettingsHref],
  );

  const isActive = useCallback(
    (href: string) => {
      if (!href || !pathname) {
        return false;
      }

      if (href.startsWith('/elements/') && pathname.startsWith('/elements/')) {
        return true;
      }

      if (
        href.startsWith('/ingredients/') &&
        pathname.startsWith('/ingredients/')
      ) {
        return true;
      }

      return pathname === href || pathname.startsWith(href);
    },
    [pathname],
  );

  return {
    brandSlug,
    href: brandHref,
    isActive,
    orgHref,
    orgSlug,
    pathname,
    prefixHref,
    routeScope,
  };
}
