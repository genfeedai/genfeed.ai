import type { IStreakCalendarResponse, IStreakSummary } from '@cloud/types';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

export class StreaksService extends HTTPBaseService {
  private static instanceMap = new Map<string, StreaksService>();

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

    const key = `${token}:${organizationId}`;
    const instance = HTTPBaseService.getBaseServiceInstance(
      StreaksService,
      token,
      organizationId,
    );

    StreaksService.instanceMap.set(key, instance);

    return instance;
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
      await this.instance.post<{ message: string; streakFreezes: number }>(
        'me/freeze',
      )
    ).data;
  }
}
