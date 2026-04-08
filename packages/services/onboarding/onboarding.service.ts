import { API_ENDPOINTS } from '@genfeedai/constants';
import type { ReferenceImageCategory } from '@genfeedai/enums';
import type {
  IBrandSetupRequest,
  IBrandSetupResponse,
  IConfirmBrandDataRequest,
  IGeneratePreviewResponse,
  IPost,
} from '@genfeedai/interfaces';
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

/**
 * Simple response from confirm/skip endpoints
 */
export interface SimpleResponse {
  success: boolean;
  message: string;
}

/**
 * Reference image payload for onboarding
 */
export interface ReferenceImagePayload {
  url: string;
  category: ReferenceImageCategory;
  label?: string;
  isDefault?: boolean;
}

/**
 * Response from adding reference images
 */
export interface AddReferenceImagesResponse {
  success: boolean;
  count: number;
}

export interface ProactiveWorkspaceResponse {
  success: boolean;
  proactiveStatus: string;
  prepPercent: number;
  prepStage: string;
  summary: string;
  brand?: {
    id: string;
    name: string;
    colors?: string[];
    voiceTone?: string;
  };
  organization?: {
    id: string;
    label: string;
  };
  outputs: IPost[];
  claimedAt?: string;
}

export interface InstallReadinessResponse {
  authMode: 'clerk' | 'none';
  billingMode: 'cloud_billing' | 'oss_local';
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
 * Handles frontend onboarding API interactions:
 * - Get onboarding status
 * - Submit brand URL for scraping
 * - Confirm extracted brand data
 * - Skip onboarding
 */
export class OnboardingService extends HTTPBaseService {
  private static instanceMap = new Map<string, OnboardingService>();

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
    const existing = OnboardingService.instanceMap.get(token);
    if (existing) {
      return existing;
    }

    const instance = new OnboardingService(token);
    OnboardingService.instanceMap.set(token, instance);
    return instance;
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

  /**
   * Submit brand URL for analysis
   * Returns extracted brand data
   */
  async setupBrand(request: IBrandSetupRequest): Promise<IBrandSetupResponse> {
    try {
      const response = await this.instance.post<IBrandSetupResponse>(
        'brand-setup',
        request,
      );
      logger.info('POST /brand-setup success', {
        brandId: response.data.brandId,
        success: response.data.success,
      });
      return response.data;
    } catch (error) {
      logger.error('POST /brand-setup failed', error);
      throw error;
    }
  }

  /**
   * Confirm extracted brand data with optional overrides
   */
  async confirmBrandData(
    brandId: string,
    data: Omit<IConfirmBrandDataRequest, 'brandId'>,
  ): Promise<SimpleResponse> {
    try {
      const response = await this.instance.patch<SimpleResponse>(
        `brand/${brandId}/confirm`,
        data,
      );
      logger.info(`PATCH /brand/${brandId}/confirm success`);
      return response.data;
    } catch (error) {
      logger.error(`PATCH /brand/${brandId}/confirm failed`, error);
      throw error;
    }
  }

  /**
   * Update brand name without scanning
   */
  async updateBrandName(brandName: string): Promise<SimpleResponse> {
    try {
      const response = await this.instance.patch<SimpleResponse>('brand-name', {
        brandName,
      });
      logger.info('PATCH /brand-name success');
      return response.data;
    } catch (error) {
      logger.error('PATCH /brand-name failed', error);
      throw error;
    }
  }

  /**
   * Skip onboarding (user will set up brand later)
   */
  async skip(reason?: string): Promise<SimpleResponse> {
    try {
      const response = await this.instance.post<SimpleResponse>('skip', {
        reason,
      });
      logger.info('POST /skip success');
      return response.data;
    } catch (error) {
      logger.error('POST /skip failed', error);
      throw error;
    }
  }

  /**
   * Add reference images to a brand during onboarding
   */
  async addReferenceImages(
    brandId: string,
    images: ReferenceImagePayload[],
  ): Promise<AddReferenceImagesResponse> {
    try {
      const response = await this.instance.post<AddReferenceImagesResponse>(
        `brand/${brandId}/reference-images`,
        { images },
      );
      logger.info(`POST /brand/${brandId}/reference-images success`, {
        count: response.data.count,
      });
      return response.data;
    } catch (error) {
      logger.error(`POST /brand/${brandId}/reference-images failed`, error);
      throw error;
    }
  }

  /**
   * Generate a preview image for the brand during onboarding
   */
  async generatePreview(
    brandId: string,
    contentType: 'ads' | 'social',
  ): Promise<IGeneratePreviewResponse> {
    try {
      const response = await this.instance.post<IGeneratePreviewResponse>(
        'generate-preview',
        { brandId, contentType },
      );
      logger.info('POST /generate-preview success', { brandId, contentType });
      return response.data;
    } catch (error) {
      logger.error('POST /generate-preview failed', error);
      throw error;
    }
  }

  async getProactiveWorkspace(): Promise<ProactiveWorkspaceResponse> {
    try {
      const response = await this.instance.get<ProactiveWorkspaceResponse>(
        'proactive-workspace',
      );
      logger.info('GET /proactive-workspace success', response.data);
      return response.data;
    } catch (error) {
      logger.error('GET /proactive-workspace failed', error);
      throw error;
    }
  }

  async claimProactiveWorkspace(): Promise<ProactiveWorkspaceResponse> {
    try {
      const response =
        await this.instance.post<ProactiveWorkspaceResponse>('proactive-claim');
      logger.info('POST /proactive-claim success', response.data);
      return response.data;
    } catch (error) {
      logger.error('POST /proactive-claim failed', error);
      throw error;
    }
  }
}
