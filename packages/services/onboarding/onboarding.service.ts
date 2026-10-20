import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  IOnboardingDraftContext,
  IOnboardingFirstDraftsResult,
  IOnboardingScanResult,
  OnboardingAccessMode,
  OnboardingRuntimeAccessMode,
} from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import { logger } from '@services/core/logger.service';

/**
 * Onboarding status response
 */
export interface OnboardingStatusResponse {
  isFirstLogin: boolean;
  hasCompletedOnboarding: boolean;
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

/**
 * OnboardingService
 *
 * Genuine onboarding reads/AI actions. The resource-shaped writes it used to
 * expose (brand setup/rename/confirm/reference-images, skip, account-type,
 * complete-funnel) were dissolved into `/brands/*`, `/organizations/*`, and
 * `/users/me` per REST audit #1354 — see BrandsService, OrganizationsService,
 * and UsersService.patchMe.
 */
export class OnboardingService extends HTTPBaseService {
  constructor(token: string) {
    super(
      `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.ONBOARDING}`,
      token,
    );
  }

  /**
   * Get singleton instance per token
   */
  public static getInstance(token: string): OnboardingService {
    return HTTPBaseService.getBaseServiceInstance(OnboardingService, token);
  }

  /**
   * Get onboarding status for current user
   */
  async getStatus(): Promise<OnboardingStatusResponse> {
    try {
      const response =
        await this.instance.get<OnboardingStatusResponse>('status');
      logger.info('GET /status success', response.data);
      return response.data;
    } catch (error) {
      logger.error('GET /status failed', error);
      throw error;
    }
  }

  async getInstallReadiness(): Promise<InstallReadinessResponse> {
    try {
      const response =
        await this.instance.get<InstallReadinessResponse>('install-readiness');
      logger.info('GET /install-readiness success', response.data);
      return response.data;
    } catch (error) {
      logger.error('GET /install-readiness failed', error);
      throw error;
    }
  }

  /** Read a public link about the brand and prefill it. A failed read is a result, not an error. */
  async scanBrand(
    brandId: string,
    url: string,
    signal?: AbortSignal,
  ): Promise<IOnboardingScanResult> {
    try {
      const response = await this.instance.post<IOnboardingScanResult>(
        `brands/${brandId}/scan`,
        { url },
        { signal },
      );
      return response.data;
    } catch (error) {
      logger.error('POST /brands/:brandId/scan failed', error);
      throw error;
    }
  }

  /** Draft one post each for X, Instagram, TikTok and LinkedIn with one shared image. */
  async generateDrafts(
    brandId: string,
    body: {
      context?: IOnboardingDraftContext;
      previousRequestKey?: string;
    },
    signal?: AbortSignal,
  ): Promise<IOnboardingFirstDraftsResult> {
    try {
      const response = await this.instance.post<IOnboardingFirstDraftsResult>(
        `brands/${brandId}/drafts`,
        body,
        { signal },
      );
      return response.data;
    } catch (error) {
      logger.error('POST /brands/:brandId/drafts failed', error);
      throw error;
    }
  }
}
