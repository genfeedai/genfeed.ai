import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import { Workflow } from '@genfeedai/models/automation/workflow.model';
import { BaseService } from '@services/core/base.service';

export class WorkflowsService extends BaseService<Workflow> {
  constructor(token: string) {
    super(API_ENDPOINTS.WORKFLOWS, token, Workflow);
  }

  public static getInstance(token: string): WorkflowsService {
    return BaseService.getDataServiceInstance(WorkflowsService, token);
  }

  /**
   * Schedules are workflow fields: `PATCH /workflows/:id` with only schedule
   * fields re-registers the cron job (see `WorkflowCrudController.update`).
   */
  async setSchedule(
    workflowId: string,
    body: {
      enabled?: boolean;
      schedule: string;
      timezone?: string;
    },
  ): Promise<void> {
    await this.instance.patch(`/${workflowId}`, {
      isScheduleEnabled: body.enabled ?? false,
      schedule: body.schedule,
      timezone: body.timezone ?? 'UTC',
    });
  }

  async removeSchedule(workflowId: string): Promise<void> {
    await this.instance.patch(`/${workflowId}`, {
      isScheduleEnabled: false,
      schedule: null,
    });
  }
}
