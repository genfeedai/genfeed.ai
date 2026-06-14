import type { IntegrationPlatform } from '@genfeedai/enums';
import { normalizeIntegration, normalizeIntegrations } from './bot-normalize';
import type { WorkflowDefinition } from './bot-workflow';
import type { OrgIntegration } from './types';

/**
 * Minimal abstraction over an HTTP layer so that BotInternalApiClient stays
 * framework-agnostic.  Bot managers inject their concrete adapter (wrapping
 * NestJS HttpService + firstValueFrom) via the constructor.
 */
export interface BotHttpAdapter {
  get<T>(url: string, headers?: Record<string, string>): Promise<T>;
  post<T>(
    url: string,
    body: unknown,
    headers?: Record<string, string>,
  ): Promise<T>;
}

export interface BotInternalApiClientOptions {
  apiUrl: string;
  apiKey?: string;
  platform: `${IntegrationPlatform}`;
  http: BotHttpAdapter;
}

/**
 * Shared internal-API client for all channel bot managers.
 *
 * Encapsulates the four request types that were previously copy-pasted
 * verbatim into DiscordBotManager, SlackBotManager, and TelegramBotManager.
 * Only the `platform` segment of the URL differs between them.
 */
export class BotInternalApiClient {
  private readonly apiUrl: string;
  private readonly apiKey?: string;
  private readonly platform: `${IntegrationPlatform}`;
  private readonly http: BotHttpAdapter;

  constructor(options: BotInternalApiClientOptions) {
    this.apiUrl = options.apiUrl;
    this.apiKey = options.apiKey;
    this.platform = options.platform;
    this.http = options.http;
  }

  private authHeaders(): Record<string, string> | undefined {
    return this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : undefined;
  }

  /**
   * Fetch all active integrations for this platform.
   * Returns an empty array on any error (ECONNREFUSED, 401, etc.) — callers
   * should handle the "0 bots" case themselves and log appropriately.
   */
  async fetchActiveIntegrations(): Promise<OrgIntegration[]> {
    const data = await this.http.get<unknown>(
      `${this.apiUrl}/v1/internal/integrations/${this.platform}`,
      this.authHeaders(),
    );
    return normalizeIntegrations(data, this.platform);
  }

  /**
   * Fetch a single integration by ID for this platform.
   * Returns `null` when the payload cannot be normalized.
   */
  async fetchIntegration(
    integrationId: string,
  ): Promise<OrgIntegration | null> {
    const data = await this.http.get<unknown>(
      `${this.apiUrl}/v1/internal/integrations/${this.platform}/${integrationId}`,
      this.authHeaders(),
    );
    return normalizeIntegration(data, this.platform);
  }

  /**
   * Fetch all workflows for the given organization.
   */
  async fetchOrgWorkflows(orgId: string): Promise<WorkflowDefinition[]> {
    return this.http.get<WorkflowDefinition[]>(
      `${this.apiUrl}/v1/orgs/${orgId}/workflows`,
      undefined,
    );
  }

  /**
   * Fetch a single workflow for the given organization.
   */
  async fetchWorkflow(
    orgId: string,
    workflowId: string,
  ): Promise<WorkflowDefinition> {
    return this.http.get<WorkflowDefinition>(
      `${this.apiUrl}/v1/orgs/${orgId}/workflows/${workflowId}`,
      undefined,
    );
  }
}
