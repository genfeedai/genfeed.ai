import {
  IntegrationPlatform,
  type IntegrationStatus,
} from '@genfeedai/contracts';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

/**
 * `orgIntegration.platform` / `.status` are Prisma enum columns, so both the
 * request DTO (`@IsEnum(IntegrationPlatform)`) and the response payload speak
 * the SCREAMING_SNAKE labels verbatim. This client types against the canonical
 * `@genfeedai/contracts` members rather than carrying a second lowercase vocabulary
 * that the API would reject on write and never match on read.
 */
export const ORG_INTEGRATION_PLATFORMS = [
  IntegrationPlatform.DISCORD,
  IntegrationPlatform.SLACK,
  IntegrationPlatform.TELEGRAM,
] as const;

export interface IOrgIntegrationConfig {
  allowedUserIds?: string[];
  appToken?: string;
  defaultWorkflow?: string;
  /**
   * Explicit opt-out of the allowlist. An empty `allowedUserIds` denies every
   * platform user; only this flag opens the bot to everyone.
   */
  isOpenToAllUsers?: boolean;
  webhookMode?: boolean;
}

export interface IOrgIntegration {
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
