import { getBrandEntityId } from '@genfeedai/contexts/user/brand-context/brand-context.helpers';
import type { IBrand } from '@genfeedai/contracts/interfaces';

/**
 * Tenant scope shared by the topbar (brand switcher) and the app rail.
 *
 * Route props are authoritative; the session-backed `resolved*` slugs only
 * fill in when the shell renders without route context. On org-level
 * `/:org/~/...` pages the brand slug stays undefined so the rail links into
 * org-scoped views instead of trapping a stale brand.
 */
export function resolveShellScope({
  brandId,
  brandSlug,
  brands,
  orgSlug,
  resolvedBrandSlug,
  resolvedOrgSlug,
  selectedBrand,
}: {
  brandId?: string;
  brandSlug?: string;
  brands: IBrand[];
  orgSlug?: string;
  resolvedBrandSlug?: string;
  resolvedOrgSlug?: string;
  selectedBrand?: IBrand | null;
}) {
  const explicitBrandSlug = brandSlug || undefined;
  const hasExplicitOrgScope = Boolean(orgSlug);
  const effectiveOrgSlug = orgSlug || resolvedOrgSlug;
  const effectiveBrandSlug = hasExplicitOrgScope
    ? explicitBrandSlug
    : (explicitBrandSlug ?? resolvedBrandSlug) || undefined;
  const isOrganizationScopeRoute = hasExplicitOrgScope && !explicitBrandSlug;
  const effectiveBrandId = brandId || getBrandEntityId(selectedBrand);
  const visibleBrandId = isOrganizationScopeRoute ? '' : effectiveBrandId;
  const selectedBrandForContext = effectiveBrandId
    ? brands.find((brand) => getBrandEntityId(brand) === effectiveBrandId) ||
      selectedBrand
    : undefined;
  const brandAwareAppSlug =
    effectiveBrandSlug || selectedBrandForContext?.slug || undefined;

  return {
    brandAwareAppSlug,
    effectiveBrandSlug,
    effectiveOrgSlug,
    isOrganizationScopeRoute,
    visibleBrandId,
  };
}
