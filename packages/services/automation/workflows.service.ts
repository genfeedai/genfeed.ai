import { API_ENDPOINTS } from '@genfeedai/constants';
import type { IServiceSerializer } from '@genfeedai/interfaces/utils/error.interface';
import { Workflow } from '@models/automation/workflow.model';
import { BaseService } from '@services/core/base.service';

const workflowSerializer: IServiceSerializer<Workflow> = {
  serialize: (data) => data,
};

export class WorkflowsService extends BaseService<Workflow> {
  constructor(token: string) {
    super(API_ENDPOINTS.WORKFLOWS, token, Workflow, workflowSerializer);
  }

  public static getInstance(token: string): WorkflowsService {
    return BaseService.getDataServiceInstance(
      WorkflowsService,
      token,
    ) as WorkflowsService;
  }

  async setSchedule(
    workflowId: string,
    body: {
      enabled?: boolean;
      schedule: string;
      timezone?: string;
    },
  ): Promise<void> {
    await this.instance.post(`/${workflowId}/schedule`, body);
  }
}
