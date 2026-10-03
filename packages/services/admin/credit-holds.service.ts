import type {
  AdminCreditHoldActionInput,
  AdminCreditHoldReport,
} from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';
export class AdminCreditHoldsService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/admin/organizations`, token);
  }
  static getInstance(token: string): AdminCreditHoldsService {
    return HTTPBaseService.getBaseServiceInstance(
      AdminCreditHoldsService,
      token,
    ) as AdminCreditHoldsService;
  }
  async list(
    organizationId: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<AdminCreditHoldReport> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      `${encodeURIComponent(organizationId)}/credit-holds`,
      { params: { cursor }, signal },
    );
    return deserializeResource<AdminCreditHoldReport>(response.data);
  }
  async act(
    organizationId: string,
    reservationId: string,
    input: AdminCreditHoldActionInput,
  ): Promise<AdminCreditHoldReport> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `${encodeURIComponent(organizationId)}/credit-holds/${encodeURIComponent(reservationId)}/actions`,
      input,
    );
    return deserializeResource<AdminCreditHoldReport>(response.data);
  }
}
