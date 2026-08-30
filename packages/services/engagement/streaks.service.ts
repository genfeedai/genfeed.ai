import type { IStreakCalendarResponse, IStreakSummary } from '@genfeedai/types';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

export class StreaksService extends HTTPBaseService {
  constructor(token: string, organizationId: string) {
    super(
      `${EnvironmentService.apiEndpoint}/organizations/${organizationId}/streaks`,
      token,
    );
  }

  public static getInstance(
    token: string,
    organizationId?: string,
  ): StreaksService {
    if (!organizationId) {
      throw new Error('organizationId is required for StreaksService');
    }

    return HTTPBaseService.getBaseServiceInstance(
      StreaksService,
      token,
      organizationId,
    );
  }

  async getMyStreak(): Promise<IStreakSummary> {
    return (await this.instance.get<IStreakSummary>('me')).data;
  }

  async getMyCalendar(params?: {
    from?: string;
    to?: string;
  }): Promise<IStreakCalendarResponse> {
    return (
      await this.instance.get<IStreakCalendarResponse>('me/calendar', {
        params,
      })
    ).data;
  }

  async useFreeze(): Promise<{ message: string; streakFreezes: number }> {
    return (
      await this.instance.patch<{ message: string; streakFreezes: number }>(
        'me',
        { freeze: true },
      )
    ).data;
  }
}
