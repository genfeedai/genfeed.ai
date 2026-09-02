import type {
  ICredential,
  IFleetCapabilities,
  IOrganizationSetting,
} from '@genfeedai/contracts/interfaces';
import type { Brand } from '@genfeedai/models/organization/brand.model';
import type { LayoutProps } from '@genfeedai/props/layout/layout.props';
import type { ProtectedBootstrapData } from '@genfeedai/props/layout/protected-bootstrap.props';
import { createContext, type PropsWithChildren, use, useMemo } from 'react';
import { DEFAULT_BRAND_CONTEXT } from './brand-context.helpers';
import { useBrandProviderState } from './useBrandProviderState';

export interface BrandContextType {
  brands: Brand[];
  brandId: string;
  setBrandId: (id: string) => void;
  organizationId: string;
  setOrganizationId: (id: string) => void;
  selectedBrand: Brand | undefined;
  credentials: ICredential[];
  credentialsError: Error | null;
  credentialsLoading: boolean;
  refreshBrands: () => Promise<void>;
  /**
   * True once `brands` reflects a settled authorization source (a hydrated
   * bootstrap payload, a completed fetch, or a session that cannot fetch).
   * Gate brand-authorization decisions on this — an empty `brands` array is
   * otherwise indistinguishable from "still loading".
   */
  isBrandScopeResolved: boolean;
  /** True when auth is loaded and brandId/organizationId are available */
  isReady: boolean;
  /** Organization settings - fetched once, shared across all components */
  settings: IOrganizationSetting | null;
  /** True when settings are being loaded */
  settingsLoading: boolean;
  /** Refresh organization settings */
  refreshSettings: () => Promise<void>;
  /** Brand-scoped fleet capability state */
  fleetCapabilities: IFleetCapabilities | null;
  fleetCapabilitiesLoading: boolean;
}

const BrandContext = createContext<BrandContextType | undefined>(undefined);

interface BrandProviderProps extends PropsWithChildren<LayoutProps> {
  initialBootstrap?: ProtectedBootstrapData | null;
}

export function BrandProvider({
  children,
  initialBootstrap = null,
}: BrandProviderProps) {
  const state = useBrandProviderState({ initialBootstrap });

  const contextValue = useMemo<BrandContextType>(
    () => ({
      brandId: state.brandId,
      brands: state.brands,
      credentials: state.credentials,
      credentialsError: state.credentialsError,
      credentialsLoading: state.credentialsLoading,
      fleetCapabilities: state.fleetCapabilities,
      fleetCapabilitiesLoading: state.fleetCapabilitiesLoading,
      isBrandScopeResolved: state.isBrandScopeResolved,
      isReady: state.isReady,
      organizationId: state.organizationId,
      refreshBrands: state.refreshBrands,
      refreshSettings: state.refreshSettings,
      selectedBrand: state.selectedBrand,
      setBrandId: state.setBrandId,
      setOrganizationId: state.setOrganizationId,
      settings: state.settings,
      settingsLoading: state.settingsLoading,
    }),
    [
      state.brandId,
      state.brands,
      state.credentials,
      state.credentialsError,
      state.credentialsLoading,
      state.fleetCapabilities,
      state.fleetCapabilitiesLoading,
      state.isBrandScopeResolved,
      state.isReady,
      state.organizationId,
      state.refreshBrands,
      state.refreshSettings,
      state.selectedBrand,
      state.setBrandId,
      state.setOrganizationId,
      state.settings,
      state.settingsLoading,
    ],
  );

  return (
    <BrandContext.Provider value={contextValue}>
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand(): BrandContextType {
  return use(BrandContext) ?? DEFAULT_BRAND_CONTEXT;
}

/** Use when you only need the brand ID — won't re-render on other changes */
export function useBrandId(): string {
  return useBrand().brandId;
}
