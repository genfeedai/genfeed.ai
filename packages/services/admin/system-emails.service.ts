import type { LifecycleSystemEmailDefinition } from '@genfeedai/constants';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

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
