import { API_ENDPOINTS } from '@genfeedai/constants';
import type { Schedule } from '@genfeedai/props/publisher/schedule.props';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

export class SchedulesService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}${API_ENDPOINTS.SCHEDULES}`, token);
  }

  async getCalendar(startDate: string, endDate: string): Promise<Schedule[]> {
    const response = await this.instance.get<Schedule[]>('/calendar', {
      params: { end: endDate, start: startDate },
    });

    return response.data.map((schedule) => ({
      ...schedule,
      createdAt: schedule.createdAt ? new Date(schedule.createdAt) : new Date(),
      scheduledAt: new Date(schedule.scheduledAt),
      schedulingMethod: schedule.schedulingMethod || 'manual',
    }));
  }
}
