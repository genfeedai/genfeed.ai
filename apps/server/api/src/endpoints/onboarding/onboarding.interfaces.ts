import type {
  IExtractedBrandData,
  OnboardingAccessMode,
  OnboardingRuntimeAccessMode,
} from '@genfeedai/interfaces';

/**
 * Response from brand setup operation
 */
export interface BrandSetupResponse {
  success: boolean;
  brandId: string;
  extractedData: IExtractedBrandData;
  message?: string;
}

export interface InstallReadinessResponse {
  access: {
    byokConfiguredProviders: string[];
    byokEnabled: boolean;
    runtimeMode: OnboardingRuntimeAccessMode;
    selectedMode: OnboardingAccessMode | null;
    serverDefaultsReady: boolean;
  };
  authMode: 'better_auth' | 'none';
  billingMode: 'cloud_billing' | 'oss_local';
  localTools: {
    anyDetected: boolean;
    claude: boolean;
    codex: boolean;
    detected: string[];
  };
  providers: {
    anyConfigured: boolean;
    configured: string[];
    fal: boolean;
    imageGenerationReady: boolean;
    openai: boolean;
    replicate: boolean;
    textGenerationReady: boolean;
  };
  ui: {
    showBilling: boolean;
    showCloudUpgradeCta: boolean;
    showCredits: boolean;
    showLocalTools: boolean;
    showPricing: boolean;
  };
  workspace: {
    brandId: string | null;
    hasBrand: boolean;
    hasOrganization: boolean;
    organizationId: string | null;
  };
}

export interface OnboardingWorkspaceContext {
  brandId: string | null;
  organizationId: string;
  userId: string;
}
