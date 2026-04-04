import type { IUser, OnboardingType } from '@cloud/interfaces';
import { API_ENDPOINTS } from '@genfeedai/constants';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import { logger } from '@services/core/logger.service';

/**
 * Payload for updating user onboarding progress
 */
export interface UpdateUserOnboardingPayload {
  isOnboardingCompleted?: boolean;
  onboardingType?: OnboardingType;
  onboardingStepsCompleted?: string[];
}

/**
 * UserOnboardingService
 *
 * Handles the user-level onboarding wizard API interactions:
 * - GET :userId/onboarding — get onboarding status
 * - PATCH :userId/onboarding — update onboarding progress
 */
export class UserOnboardingService extends HTTPBaseService {
  private static instanceMap = new Map<string, UserOnboardingService>();

  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}${API_ENDPOINTS.USERS}`, token);
  }

  public static getInstance(token: string): UserOnboardingService {
    if (!UserOnboardingService.instanceMap.has(token)) {
      UserOnboardingService.instanceMap.set(
        token,
        new UserOnboardingService(token),
      );
    }
    return UserOnboardingService.instanceMap.get(token)!;
  }

  /**
   * Get onboarding status for a user
   */
  async getOnboarding(userId: string): Promise<IUser> {
    try {
      const response = await this.instance.get(`${userId}/onboarding`);
      logger.info(`GET /${userId}/onboarding success`);
      return response.data?.data?.attributes ?? response.data;
    } catch (error) {
      logger.error(`GET /${userId}/onboarding failed`, error);
      throw error;
    }
  }

  /**
   * Update onboarding progress for a user
   */
  async updateOnboarding(
    userId: string,
    payload: UpdateUserOnboardingPayload,
  ): Promise<IUser> {
    try {
      const response = await this.instance.patch(
        `${userId}/onboarding`,
        payload,
      );
      logger.info(`PATCH /${userId}/onboarding success`, payload);
      return response.data?.data?.attributes ?? response.data;
    } catch (error) {
      logger.error(`PATCH /${userId}/onboarding failed`, error);
      throw error;
    }
  }
}
