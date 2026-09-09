import type { LifecycleSystemEmailDefinition } from '@genfeedai/contracts/constants';
import type {
  IEmailPerformanceQuery,
  IEmailPerformanceReport,
} from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

export class AdminSystemEmailsService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/admin/system-emails`, token);
  }

  public static getInstance(token: string): AdminSystemEmailsService {
    return HTTPBaseService.getBaseServiceInstance(
      AdminSystemEmailsService,
      token,
    ) as AdminSystemEmailsService;
  }

  async getPerformance(
    query: IEmailPerformanceQuery,
    signal?: AbortSignal,
  ): Promise<IEmailPerformanceReport> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      'performance',
      { params: query, signal },
    );
    return deserializeResource<IEmailPerformanceReport>(response.data);
  }

  async getSystemEmails(
    signal?: AbortSignal,
  ): Promise<LifecycleSystemEmailDefinition[]> {
    const response = await this.instance.get<LifecycleSystemEmailDefinition[]>(
      '',
      { signal },
    );
    return response.data;
  }
}
