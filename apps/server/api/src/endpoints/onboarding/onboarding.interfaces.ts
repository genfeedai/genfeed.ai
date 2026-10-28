import type { FirstRunImageSlots } from '@api/helpers/utils/first-run-image-generation/first-run-image-generation.interfaces';
import type {
  IBrandScrapeWarning,
  IExtractedBrandData,
  OnboardingAccessMode,
  OnboardingRuntimeAccessMode,
} from '@genfeedai/contracts/interfaces';

/**
 * Response from brand setup operation
 */
export interface BrandSetupResponse {
  success: boolean;
  brandId: string;
  extractedData: IExtractedBrandData;
  message?: string;
  /** Set when the scrape degraded to a fallback brand profile (#5080). */
  scrapeWarning?: IBrandScrapeWarning;
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
    openrouter: boolean;
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

/** What the first-run image brief is derived from. */
export interface OnboardingImageBriefInput {
  audience?: string;
  brandName: string;
  description?: string;
  goals?: string[];
  offer?: string;
  /** The X post the image illustrates. */
  post: string;
  tone?: string;
}

/** A lead sentence plus the structured slots, ready for the image request body. */
export interface OnboardingImageBrief {
  prompt: string;
  slots: FirstRunImageSlots;
}
