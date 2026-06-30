import type { IBrand } from '@genfeedai/interfaces';
import type { BrandContextType } from './brand-context';

export const BRAND_CONTEXT_CACHE_TTL_MS = 60_000;

export function getBrandEntityId(brand: IBrand | null | undefined): string {
  if (typeof brand?.id === 'string') {
    return brand.id;
  }

  const brandWithMongoId = brand as unknown as { _id?: unknown } | null;

  if (typeof brandWithMongoId?._id === 'string') {
    return brandWithMongoId._id;
  }

  return '';
}

export function getBrandOrganizationId(
  brand: IBrand | null | undefined,
): string {
  const organization = brand?.organization;

  if (typeof organization === 'string') {
    return organization;
  }

  if (
    organization &&
    typeof organization === 'object' &&
    'id' in organization &&
    typeof organization.id === 'string'
  ) {
    return organization.id;
  }

  if (
    organization &&
    typeof organization === 'object' &&
    '_id' in organization &&
    typeof organization._id === 'string'
  ) {
    return organization._id;
  }

  // The protected bootstrap serializer nests `organization` as `{ slug }` only,
  // exposing the organization id as the brand's top-level `organizationId`
  // field. Fall back to it so the org scope resolves — otherwise
  // `scopedOrganizationId` stays empty, the access-state query never enables,
  // `accessState` is null, and OnboardingGuard/SubscriptionGuard spin forever.
  const brandWithOrgId = brand as unknown as {
    organizationId?: unknown;
  } | null;
  if (
    typeof brandWithOrgId?.organizationId === 'string' &&
    brandWithOrgId.organizationId.length > 0
  ) {
    return brandWithOrgId.organizationId;
  }

  return '';
}

export function getBrandOrganizationSlug(
  brand: IBrand | null | undefined,
): string {
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

export const DEFAULT_BRAND_CONTEXT: BrandContextType = {
  brandId: '',
  brands: [],
  credentials: [],
  darkroomCapabilities: null,
  darkroomCapabilitiesLoading: false,
  isReady: false,
  organizationId: '',
  refreshBrands: async () => {
    /* noop */
  },
  refreshSettings: async () => {
    /* noop */
  },
  selectedBrand: undefined,
  setBrandId: () => {
    /* noop */
  },
  setOrganizationId: () => {
    /* noop */
  },
  settings: null,
  settingsLoading: false,
};
