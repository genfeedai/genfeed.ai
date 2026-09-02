import { createBrandAppRoute } from '@genfeedai/contracts/constants';
import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import { matchesMenuSearchParams } from '@helpers/navigation/menu-route-match.helper';
import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

type MenuHrefConfig = Pick<MenuItemConfig, 'href' | 'hrefScope'>;

export function useMenuRouteResolution() {
  const rawPathname = usePathname();
  const rawSearchParams = useSearchParams();
  const searchParamsString = rawSearchParams?.toString() ?? '';
  const searchParams = useMemo(
    () => new URLSearchParams(searchParamsString),
    [searchParamsString],
  );
  const {
    activeHref,
    href: brandHref,
    orgHref,
    orgSlug,
    brandSlug,
  } = useOrgUrl();

  const routeScope = useMemo(() => {
    const parts = rawPathname.split('/').filter(Boolean);

    if (parts[0] === 'admin') {
      return 'global' as const;
    }

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

    if (parts[0] === 'admin') {
      return rawPathname;
    }

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
    (href: string, matchSearchParams?: MenuItemConfig['matchSearchParams']) => {
      if (!href || !pathname) {
        return false;
      }

      const hrefPathname = href.split('?')[0] ?? href;

      if (
        hrefPathname.startsWith('/elements/') &&
        pathname.startsWith('/elements/')
      ) {
        return matchesMenuSearchParams(searchParams, matchSearchParams);
      }

      if (
        hrefPathname.startsWith('/ingredients/') &&
        pathname.startsWith('/ingredients/')
      ) {
        return matchesMenuSearchParams(searchParams, matchSearchParams);
      }

      // Segment-boundary prefix match: `/workspace` must not light on
      // `/workspaceX`, and is paired with `isExactMatch` on module Overview
      // roots so `/workspace/activity` does not keep Overview active.
      const pathMatches =
        pathname === hrefPathname || pathname.startsWith(`${hrefPathname}/`);

      return (
        pathMatches && matchesMenuSearchParams(searchParams, matchSearchParams)
      );
    },
    [pathname, searchParams],
  );

  return {
    activeHref,
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
