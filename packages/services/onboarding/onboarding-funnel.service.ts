import { API_ENDPOINTS } from '@genfeedai/constants';
import type { OrganizationCategory } from '@genfeedai/enums';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import { logger } from '@services/core/logger.service';

interface FunnelResponse {
  success: boolean;
  message: string;
}

/**
 * OnboardingFunnelService
 *
 * Handles the onboarding funnel API interactions:
 * - Set account type (Creator/Business/Agency)
 * - Complete funnel (after Stripe payment)
 */
export class OnboardingFunnelService extends HTTPBaseService {
  private static instanceMap = new Map<string, OnboardingFunnelService>();

  constructor(token: string) {
    super(
      `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.ONBOARDING}`,
      token,
    );
  }

  public static getInstance(token: string): OnboardingFunnelService {
    if (!OnboardingFunnelService.instanceMap.has(token)) {
      OnboardingFunnelService.instanceMap.set(
        token,
        new OnboardingFunnelService(token),
      );
    }
    return OnboardingFunnelService.instanceMap.get(token)!;
  }

  /**
   * Set the account type during onboarding
   */
  async setAccountType(
    category: OrganizationCategory,
  ): Promise<FunnelResponse> {
    try {
      const response = await this.instance.post<FunnelResponse>(
        'account-type',
        { category },
      );
      logger.info('POST /account-type success', { category });
      return response.data;
    } catch (error) {
      logger.error('POST /account-type failed', error);
      throw error;
    }
  }

  /**
   * Mark onboarding funnel as completed (after Stripe payment)
   */
  async completeFunnel(): Promise<FunnelResponse> {
    try {
      const response = await this.instance.post<FunnelResponse>(
        'complete-funnel',
        {},
      );
      logger.info('POST /complete-funnel success');
      return response.data;
    } catch (error) {
      logger.error('POST /complete-funnel failed', error);
      throw error;
    }
  }
}
