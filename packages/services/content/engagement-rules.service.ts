import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  CreateEngagementRuleInput,
  IEngagementRule,
  UpdateEngagementRuleInput,
} from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  extractCollection,
  extractResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

export class EngagementRulesService extends HTTPBaseService {
  constructor(token: string) {
    super(
      `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.ENGAGEMENT_RULES}`,
      token,
    );
  }

  public static getInstance(token: string): EngagementRulesService {
    return HTTPBaseService.getBaseServiceInstance(
      EngagementRulesService,
      token,
    ) as EngagementRulesService;
  }

  async findAll(
    query: Record<string, unknown> = {},
    signal?: AbortSignal,
  ): Promise<IEngagementRule[]> {
    const response = await this.instance.get<JsonApiResponseDocument>('', {
      params: query,
      signal,
    });
    return extractCollection<IEngagementRule>(response.data);
  }

  async post(input: CreateEngagementRuleInput): Promise<IEngagementRule> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      '',
      input,
    );
    return extractResource<IEngagementRule>(response.data);
  }

  async patch(
    id: string,
    input: UpdateEngagementRuleInput,
  ): Promise<IEngagementRule> {
    const response = await this.instance.patch<JsonApiResponseDocument>(
      `/${id}`,
      input,
    );
    return extractResource<IEngagementRule>(response.data);
  }

  async delete(id: string): Promise<void> {
    await this.instance.delete(`/${id}`);
  }
}
