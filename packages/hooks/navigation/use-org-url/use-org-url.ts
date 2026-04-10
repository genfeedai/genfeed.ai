'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import type { IBrand } from '@genfeedai/interfaces';
import { useParams } from 'next/navigation';

export interface OrgUrlContext {
  orgSlug: string;
  brandSlug: string;
  /** Build a brand-scoped URL: /:orgSlug/:brandSlug/path */
  href: (path: string) => string;
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
 * Reads `orgSlug` and `brandSlug` from the current route params.
 * Falls back to the active brand slug from context when on org-level
 * pages where `[brandSlug]` is not in the URL (e.g. `/:orgSlug/~/settings`).
 *
 * @example
 * ```tsx
 * const { href, orgHref } = useOrgUrl();
 *
 * <Link href={href('/workspace/overview')}>Workspace</Link>
 * <Link href={orgHref('/settings')}>Org Settings</Link>
 * ```
 */
export function useOrgUrl(): OrgUrlContext {
  const params = useParams<{ orgSlug: string; brandSlug: string }>();
  const { selectedBrand } = useBrand();

  const orgSlug =
    params.orgSlug ?? getBrandOrganizationSlug(selectedBrand) ?? '';
  // On org-level pages (/:orgSlug/~/...) brandSlug is absent from params.
  // Fall back to the active brand slug from context so href() still works.
  const brandSlug = params.brandSlug ?? selectedBrand?.slug ?? '';

  const normalizePath = (path: string) =>
    path.startsWith('/') ? path : `/${path}`;

  return {
    brandSlug,
    href: (path: string) => `/${orgSlug}/${brandSlug}${normalizePath(path)}`,
    orgHref: (path: string) => `/${orgSlug}/~${normalizePath(path)}`,
    orgSlug,
  };
}
