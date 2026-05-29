import type {
  ICredential,
  IDarkroomCapabilities,
  IOrganizationSetting,
} from '@genfeedai/interfaces';
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
  refreshBrands: () => Promise<void>;
  /** True when auth is loaded and brandId/organizationId are available */
  isReady: boolean;
  /** Organization settings - fetched once, shared across all components */
  settings: IOrganizationSetting | null;
  /** True when settings are being loaded */
  settingsLoading: boolean;
  /** Refresh organization settings */
  refreshSettings: () => Promise<void>;
  /** Brand-scoped darkroom capability state */
  darkroomCapabilities: IDarkroomCapabilities | null;
  darkroomCapabilitiesLoading: boolean;
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
      darkroomCapabilities: state.darkroomCapabilities,
      darkroomCapabilitiesLoading: state.darkroomCapabilitiesLoading,
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
      state.darkroomCapabilities,
      state.darkroomCapabilitiesLoading,
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
