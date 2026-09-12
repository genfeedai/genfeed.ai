'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  createBrandAppRoute,
  createOrganizationAppRoute,
  parseScopedAppPath,
} from '@genfeedai/contracts/constants';
import type { IBrand } from '@genfeedai/contracts/interfaces';
import { useParams, usePathname } from 'next/navigation';
import { useCallback } from 'react';

export interface OrgUrlContext {
  orgSlug: string;
  brandSlug: string;
  /** Build a brand-scoped URL: /:orgSlug/:brandSlug/path */
  href: (path: string) => string;
  /** Build a URL for the selected brand, or organization scope when none is selected. */
  activeHref: (path: string) => string;
  /** Build an org-level URL: /:orgSlug/~/path */
  orgHref: (path: string) => string;
}

function getBrandOrganizationSlug(brand: IBrand | null | undefined): string {
  const organization = brand?.organization;

  if (
    organization &&
    typeof organization === 'object' &&
    'slug' in organization &&
    typeof organization.slug === 'string'
  ) {
    return organization.slug;
  }

  return '';
}

/**
 * Central navigation utility for org-scoped URLs.
 *
 * Reads `orgSlug` and `brandSlug` from the current route params, then the
 * pathname (parent layouts sit above `[orgSlug]/[brandSlug]` and cannot see
 * those params). Falls back to the active brand from context only when the
 * URL has no org/brand. Org-level routes with `/:orgSlug/~/...` stay brandless.
 *
 * @example
 * ```tsx
 * const { href, orgHref } = useOrgUrl();
 *
 * <Link href={href('/workspace')}>Workspace</Link>
 * <Link href={orgHref('/settings')}>Org Settings</Link>
 * ```
 */
export function useOrgUrl(): OrgUrlContext {
  const params = useParams<{ orgSlug: string; brandSlug: string }>();
  const pathname = usePathname();
  const { selectedBrand } = useBrand();
  const pathScope = parseScopedAppPath(pathname ?? '');

  const routeOrgSlug =
    (typeof params.orgSlug === 'string' ? params.orgSlug : '') ||
    pathScope.orgSlug;
  const routeBrandSlug =
    typeof params.brandSlug === 'string'
      ? params.brandSlug
      : pathScope.brandSlug;

  const orgSlug = routeOrgSlug || getBrandOrganizationSlug(selectedBrand);
  const brandSlug = routeBrandSlug || (routeOrgSlug ? '' : selectedBrand?.slug);
  // URL brand wins. selectedBrand is only the last-used payload when the URL
  // has no brand (org `~` routes and unscoped leftovers like /agent/new).
  const activeBrandSlug = routeBrandSlug || selectedBrand?.slug;

  // Memoized on the resolved slugs, not recreated every render, so consumers
  // that depend on these callbacks in a useEffect deps array (e.g. resume/
  // bootstrap effects) don't see a new identity — and an aborted in-flight
  // request — on every unrelated re-render.
  const orgHref = useCallback(
    (path: string) => createOrganizationAppRoute(orgSlug, path),
    [orgSlug],
  );

  const href = useCallback(
    (path: string) =>
      brandSlug ? createBrandAppRoute(orgSlug, brandSlug, path) : orgHref(path),
    [brandSlug, orgHref, orgSlug],
  );

  const activeHref = useCallback(
    (path: string) =>
      activeBrandSlug
        ? createBrandAppRoute(orgSlug, activeBrandSlug, path)
        : orgHref(path),
    [activeBrandSlug, orgHref, orgSlug],
  );

  return {
    activeHref,
    brandSlug: brandSlug ?? '',
    href,
    orgHref,
    orgSlug,
  };
}
