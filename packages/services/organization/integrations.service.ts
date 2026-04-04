import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@helpers/data/json-api/json-api.helper';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

export const ORG_INTEGRATION_PLATFORMS = [
  'discord',
  'slack',
  'telegram',
] as const;
export type IntegrationPlatform = (typeof ORG_INTEGRATION_PLATFORMS)[number];
export type IntegrationStatus = 'active' | 'error' | 'paused';

export interface IOrgIntegrationConfig {
  allowedUserIds?: string[];
  appToken?: string;
  defaultWorkflow?: string;
  webhookMode?: boolean;
}

export interface IOrgIntegration {
  _id?: string;
  botToken?: string;
  config?: IOrgIntegrationConfig;
  createdAt?: string;
  id?: string;
  organization?: string;
  platform: IntegrationPlatform;
  status?: IntegrationStatus;
  updatedAt?: string;
}

export interface ICreateIntegrationPayload {
  botToken: string;
  config?: IOrgIntegrationConfig;
  platform: IntegrationPlatform;
}

export interface IUpdateIntegrationPayload {
  botToken?: string;
  config?: IOrgIntegrationConfig;
  status?: IntegrationStatus;
}

export class IntegrationsService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/organizations`, token);
  }

  public static getInstance(token: string): IntegrationsService {
    return HTTPBaseService.getBaseServiceInstance(
      IntegrationsService,
      token,
    ) as IntegrationsService;
  }

  public async findAll(orgId: string): Promise<IOrgIntegration[]> {
    return this.instance
      .get<JsonApiResponseDocument>(`/${orgId}/integrations`)
      .then((res) => deserializeCollection<IOrgIntegration>(res.data));
  }

  public async create(
    orgId: string,
    payload: ICreateIntegrationPayload,
  ): Promise<IOrgIntegration> {
    return this.instance
      .post<JsonApiResponseDocument>(`/${orgId}/integrations`, payload)
      .then((res) => deserializeResource<IOrgIntegration>(res.data));
  }

  public async update(
    orgId: string,
    integrationId: string,
    payload: IUpdateIntegrationPayload,
  ): Promise<IOrgIntegration> {
    return this.instance
      .patch<JsonApiResponseDocument>(
        `/${orgId}/integrations/${integrationId}`,
        payload,
      )
      .then((res) => deserializeResource<IOrgIntegration>(res.data));
  }

  public async remove(orgId: string, integrationId: string): Promise<void> {
    await this.instance.delete(`/${orgId}/integrations/${integrationId}`);
  }
}
