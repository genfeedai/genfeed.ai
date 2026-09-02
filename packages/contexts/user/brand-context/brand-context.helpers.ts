import type { IBrand } from '@genfeedai/contracts/interfaces';
import type { BrandContextType } from './brand-context';

export const BRAND_CONTEXT_CACHE_TTL_MS = 60_000;

export function getBrandEntityId(brand: IBrand | null | undefined): string {
  return typeof brand?.id === 'string' ? brand.id : '';
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

  // The protected bootstrap serializer nests `organization` as `{ slug }` only,
  // exposing the organization id as the brand's top-level `organizationId`
  // field. Fall back to it so the org scope resolves — otherwise
  // `scopedOrganizationId` stays empty, the access-state query never enables,
  // `accessState` is null, and OnboardingGuard/SubscriptionGuard spin forever.
  if (typeof brand?.organizationId === 'string' && brand.organizationId) {
    return brand.organizationId;
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
  credentialsError: null,
  credentialsLoading: false,
  fleetCapabilities: null,
  fleetCapabilitiesLoading: false,
  isBrandScopeResolved: false,
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
