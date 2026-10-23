import type {
  AdminModelDetail,
  UpdateModelProviderRouting,
} from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

export class AdminModelDetailService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/admin/model-details`, token);
  }
  static getInstance(token: string): AdminModelDetailService {
    return HTTPBaseService.getBaseServiceInstance(
      AdminModelDetailService,
      token,
    ) as AdminModelDetailService;
  }
  async detail(
    id: string,
    days: number,
    signal?: AbortSignal,
  ): Promise<AdminModelDetail> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      encodeURIComponent(id),
      { params: { days }, signal },
    );
    return deserializeResource<AdminModelDetail>(response.data);
  }
  async update(id: string, patch: UpdateModelProviderRouting): Promise<void> {
    await this.instance.patch(encodeURIComponent(id), patch);
  }
  async setProviderActive(provider: string, isActive: boolean): Promise<void> {
    await this.instance.patch(`providers/${encodeURIComponent(provider)}`, {
      isActive,
    });
  }
}
