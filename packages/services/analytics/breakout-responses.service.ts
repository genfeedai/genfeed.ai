import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  BreakoutResponseDetailParams,
  BreakoutResponseListParams,
  BreakoutResponsePage,
  BreakoutResponseView,
} from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

export class BreakoutResponsesService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}${API_ENDPOINTS.BRANDS}`, token);
  }

  public static forOrganization(
    token: string,
    organizationId: string,
  ): BreakoutResponsesService {
    const service = new BreakoutResponsesService(token);
    service.bindRequestOrganization(organizationId);
    return service;
  }

  public async list(
    brandId: string,
    params: BreakoutResponseListParams = {},
    signal?: AbortSignal,
  ): Promise<BreakoutResponsePage> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      `${encodeURIComponent(brandId)}/breakout-responses`,
      { params, signal },
    );
    const docs = deserializeCollection<BreakoutResponseView>(response.data);
    const pagination = response.data.links?.pagination;
    const limit = pagination?.limit ?? params.limit ?? 20;
    const total = pagination?.total ?? docs.length;
    return {
      docs,
      limit,
      page: pagination?.page ?? params.page ?? 1,
      pages: pagination?.pages ?? Math.ceil(total / limit),
      total,
    };
  }

  public async detail(
    brandId: string,
    id: string,
    params: BreakoutResponseDetailParams = {},
    signal?: AbortSignal,
  ): Promise<BreakoutResponseView> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      `${encodeURIComponent(brandId)}/breakout-responses/${encodeURIComponent(id)}`,
      { params, signal },
    );
    return deserializeResource<BreakoutResponseView>(response.data);
  }
}
