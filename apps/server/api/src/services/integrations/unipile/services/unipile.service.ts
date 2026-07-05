import { CredentialCryptoService } from '@api/collections/credentials/services/credential-crypto.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import {
  type UnipileAccount,
  type UnipileConnection,
  type UnipileCreateCalendarEventInput,
  type UnipileIntegrationStatus,
  type UnipileListCalendarEventsQuery,
  type UnipileListEmailsQuery,
  type UnipileListMessagesQuery,
  type UnipilePaginatedResult,
  type UnipileProviderConfig,
  type UnipileRawRecord,
  type UnipileSendEmailInput,
  type UnipileSendMessageInput,
} from '@api/services/integrations/unipile/interfaces/unipile.interface';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IntegrationStatus } from '@genfeedai/enums';
import {
  getIntegrationProviderDefinition,
  IntegrationHttpClient,
} from '@genfeedai/integrations';
import {
  IntegrationPlatform as PrismaIntegrationPlatform,
  IntegrationStatus as PrismaIntegrationStatus,
} from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

const UNIPILE_PROVIDER = getIntegrationProviderDefinition('unipile');
const PRISMA_UNIPILE_PLATFORM =
  'UNIPILE' as (typeof PrismaIntegrationPlatform)[keyof typeof PrismaIntegrationPlatform];
const PRISMA_ACTIVE_STATUS =
  'ACTIVE' as (typeof PrismaIntegrationStatus)[keyof typeof PrismaIntegrationStatus];
const DEFAULT_TIMEOUT_MS = 30000;

@Injectable()
export class UnipileService {
  private readonly constructorName = String(this.constructor.name);
  private readonly integrationHttpClient: IntegrationHttpClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
    private readonly cryptoService: CredentialCryptoService,
  ) {
    this.integrationHttpClient = new IntegrationHttpClient({
      fetch: (input, init) => this.fetchViaHttpService(input, init),
      logger: this.loggerService,
    });
  }

  async configure(
    organizationId: string,
    input: {
      allowedAccountIds?: string[];
      apiBaseUrl: string;
      apiKey: string;
      defaultAccountId?: string;
    },
  ): Promise<UnipileIntegrationStatus> {
    const apiBaseUrl = this.normalizeApiBaseUrl(input.apiBaseUrl);
    const defaultAccountId = this.toOptionalString(input.defaultAccountId);
    const config: UnipileProviderConfig = {
      allowedAccountIds: this.normalizeAccountIds(input.allowedAccountIds),
      apiBaseUrl,
      ...(defaultAccountId ? { defaultAccountId } : {}),
    };

    if (
      config.defaultAccountId &&
      config.allowedAccountIds.length > 0 &&
      !config.allowedAccountIds.includes(config.defaultAccountId)
    ) {
      throw new BadRequestException(
        'defaultAccountId must be included in allowedAccountIds',
      );
    }

    const existing = await this.prisma.orgIntegration.findFirst({
      where: {
        isDeleted: false,
        organizationId,
        platform: PRISMA_UNIPILE_PLATFORM,
      },
    });

    const encryptedToken = this.cryptoService.encrypt(input.apiKey);

    const integration = existing
      ? await this.prisma.orgIntegration.update({
          data: {
            config: config as unknown as never,
            encryptedToken,
            status: PRISMA_ACTIVE_STATUS,
          },
          where: { id: existing.id },
        })
      : await this.prisma.orgIntegration.create({
          data: {
            config: config as unknown as never,
            encryptedToken,
            organizationId,
            platform: PRISMA_UNIPILE_PLATFORM,
            status: PRISMA_ACTIVE_STATUS,
          },
        });

    return this.toStatus({
      config,
      configured: true,
      source: 'organization',
      status: this.toApiStatus(integration.status),
    });
  }

  async getStatus(organizationId: string): Promise<UnipileIntegrationStatus> {
    const integration = await this.prisma.orgIntegration.findFirst({
      where: {
        isDeleted: false,
        organizationId,
        platform: PRISMA_UNIPILE_PLATFORM,
      },
    });

    if (integration) {
      return this.toStatus({
        config: this.parseConfig(integration.config),
        configured: true,
        source: 'organization',
        status: this.toApiStatus(integration.status),
      });
    }

    const environmentConfig = this.getEnvironmentConfig();
    if (environmentConfig) {
      return this.toStatus({
        config: environmentConfig,
        configured: true,
        source: 'environment',
        status: IntegrationStatus.ACTIVE,
      });
    }

    return {
      allowedAccountIds: [],
      configured: false,
    };
  }

  async listAccounts(
    organizationId: string,
    cursor?: string,
  ): Promise<UnipilePaginatedResult<UnipileAccount>> {
    const connection = await this.resolveConnection(organizationId);
    const response = await this.request<UnipileRawRecord>(connection, {
      path: 'accounts',
      ...(cursor ? { query: { cursor } } : {}),
    });

    const accounts = this.extractRecords(response, [
      'accounts',
      'items',
      'data',
    ])
      .map((record) => this.normalizeAccount(record))
      .filter((account) =>
        this.isAccountAllowed(connection.config, account.id),
      );
    const nextCursor = this.toOptionalCursor(response['cursor']);

    return {
      items: accounts,
      ...(nextCursor !== undefined ? { cursor: nextCursor } : {}),
    };
  }

  async listMessages(
    organizationId: string,
    query: UnipileListMessagesQuery = {},
  ): Promise<UnipilePaginatedResult<UnipileRawRecord>> {
    const connection = await this.resolveConnection(organizationId);
    if (query.accountId) {
      this.assertAccountAllowed(connection.config, query.accountId);
    }

    const response = await this.request<UnipileRawRecord>(connection, {
      path: 'messages',
      query: this.compactQuery({
        account_id: query.accountId,
        chat_id: query.chatId,
        cursor: query.cursor,
        limit: query.limit,
      }),
    });
    const cursor = this.toOptionalCursor(response['cursor']);

    return {
      items: this.extractRecords(response, ['messages', 'items', 'data']),
      ...(cursor !== undefined ? { cursor } : {}),
    };
  }

  async sendMessageToChat(
    organizationId: string,
    input: UnipileSendMessageInput,
  ): Promise<UnipileRawRecord> {
    const connection = await this.resolveConnection(organizationId);

    return this.request<UnipileRawRecord>(connection, {
      body: { text: input.text },
      method: 'POST',
      path: `chats/${encodeURIComponent(input.chatId)}/messages`,
    });
  }

  async listEmails(
    organizationId: string,
    query: UnipileListEmailsQuery = {},
  ): Promise<UnipilePaginatedResult<UnipileRawRecord>> {
    const connection = await this.resolveConnection(organizationId);
    if (query.accountId) {
      this.assertAccountAllowed(connection.config, query.accountId);
    }

    const response = await this.request<UnipileRawRecord>(connection, {
      path: 'emails',
      query: this.compactQuery({
        account_id: query.accountId,
        after: query.after,
        before: query.before,
        cursor: query.cursor,
        limit: query.limit,
        meta_only: query.metaOnly,
      }),
    });
    const cursor = this.toOptionalCursor(response['cursor']);

    return {
      items: this.extractRecords(response, ['emails', 'items', 'data']),
      ...(cursor !== undefined ? { cursor } : {}),
    };
  }

  async sendEmail(
    organizationId: string,
    input: UnipileSendEmailInput,
  ): Promise<UnipileRawRecord> {
    const connection = await this.resolveConnection(organizationId);
    this.assertAccountAllowed(connection.config, input.accountId);

    return this.request<UnipileRawRecord>(connection, {
      body: this.compactBody({
        account_id: input.accountId,
        bcc: this.toContactPayload(input.bcc),
        body: input.body,
        cc: this.toContactPayload(input.cc),
        reply_to: input.replyTo,
        subject: input.subject,
        to: this.toContactPayload(input.to),
        tracking_options: input.trackingOptions,
      }),
      method: 'POST',
      path: 'emails',
    });
  }

  async listCalendarEvents(
    organizationId: string,
    query: UnipileListCalendarEventsQuery = {},
  ): Promise<UnipilePaginatedResult<UnipileRawRecord>> {
    const connection = await this.resolveConnection(organizationId);
    if (query.accountId) {
      this.assertAccountAllowed(connection.config, query.accountId);
    }

    const response = await this.request<UnipileRawRecord>(connection, {
      path: 'calendar/events',
      query: this.compactQuery({
        account_id: query.accountId,
        calendar_id: query.calendarId,
        cursor: query.cursor,
        limit: query.limit,
      }),
    });
    const cursor = this.toOptionalCursor(response['cursor']);

    return {
      items: this.extractRecords(response, ['events', 'items', 'data']),
      ...(cursor !== undefined ? { cursor } : {}),
    };
  }

  async createCalendarEvent(
    organizationId: string,
    input: UnipileCreateCalendarEventInput,
  ): Promise<UnipileRawRecord> {
    const connection = await this.resolveConnection(organizationId);
    this.assertAccountAllowed(connection.config, input.accountId);

    return this.request<UnipileRawRecord>(connection, {
      body: this.compactBody({
        account_id: input.accountId,
        calendar_id: input.calendarId,
        description: input.description,
        end: input.end,
        location: input.location,
        start: input.start,
        title: input.title,
      }),
      method: 'POST',
      path: 'calendar/events',
    });
  }

  private async resolveConnection(
    organizationId: string,
  ): Promise<UnipileConnection> {
    const integration = await this.prisma.orgIntegration.findFirst({
      where: {
        isDeleted: false,
        organizationId,
        platform: PRISMA_UNIPILE_PLATFORM,
        status: PRISMA_ACTIVE_STATUS,
      },
    });

    if (integration) {
      return {
        apiKey: this.cryptoService.decrypt(integration.encryptedToken),
        config: this.parseConfig(integration.config),
        organizationId,
        source: 'organization',
      };
    }

    const environmentConfig = this.getEnvironmentConfig();
    const apiKey = this.getConfigString('UNIPILE_API_KEY');
    if (environmentConfig && apiKey) {
      return {
        apiKey,
        config: environmentConfig,
        organizationId,
        source: 'environment',
      };
    }

    throw new NotFoundException({
      message: 'Unipile integration not configured',
    });
  }

  private async request<T>(
    connection: UnipileConnection,
    options: {
      body?: Record<string, unknown>;
      method?: 'GET' | 'POST';
      path: string;
      query?: Record<string, string | number | boolean>;
    },
  ): Promise<T> {
    const url = `${connection.config.apiBaseUrl}/${options.path}`;
    return await this.integrationHttpClient.request<T>({
      headers: {
        'X-API-KEY': connection.apiKey,
        accept: 'application/json',
      },
      method: options.method ?? 'GET',
      timeoutMs: DEFAULT_TIMEOUT_MS,
      url,
      ...(options.body ? { body: options.body } : {}),
      ...(options.query ? { query: options.query } : {}),
      ...(UNIPILE_PROVIDER ? { provider: UNIPILE_PROVIDER } : {}),
    });
  }

  private async fetchViaHttpService(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const parsedUrl = new URL(String(input));
    const url = `${parsedUrl.origin}${parsedUrl.pathname}`;
    const options = {
      headers: init?.headers as Record<string, string> | undefined,
      params: Object.fromEntries(parsedUrl.searchParams.entries()),
      timeout: DEFAULT_TIMEOUT_MS,
      ...(init?.signal ? { signal: init.signal } : {}),
    };
    const method = init?.method ?? 'GET';

    try {
      const response = await firstValueFrom(
        method === 'POST'
          ? this.httpService.post(url, init?.body ?? null, options)
          : this.httpService.get(url, options),
      );

      return new Response(JSON.stringify(response.data), {
        headers: { 'content-type': 'application/json' },
        status: response.status ?? 200,
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName} ${CallerUtil.getCallerName()} failed`,
        error,
      );
      throw error;
    }
  }

  private parseConfig(config: unknown): UnipileProviderConfig {
    if (!config || typeof config !== 'object') {
      throw new BadRequestException('Unipile integration config is invalid');
    }

    const record = config as Record<string, unknown>;
    const apiBaseUrl = this.toOptionalString(record['apiBaseUrl']);
    const defaultAccountId = this.toOptionalString(record['defaultAccountId']);
    if (!apiBaseUrl) {
      throw new BadRequestException('Unipile API base URL is missing');
    }

    return {
      allowedAccountIds: this.normalizeAccountIds(record['allowedAccountIds']),
      apiBaseUrl: this.normalizeApiBaseUrl(apiBaseUrl),
      ...(defaultAccountId ? { defaultAccountId } : {}),
    };
  }

  private getEnvironmentConfig(): UnipileProviderConfig | undefined {
    const apiBaseUrl = this.getConfigString('UNIPILE_API_BASE_URL');
    if (!apiBaseUrl) {
      return undefined;
    }

    return {
      allowedAccountIds: [],
      apiBaseUrl: this.normalizeApiBaseUrl(apiBaseUrl),
    };
  }

  private normalizeApiBaseUrl(value: string): string {
    const trimmed = value.trim().replace(/\/+$/, '');
    if (!trimmed) {
      throw new BadRequestException('Unipile API base URL is required');
    }

    return trimmed.endsWith('/api/v1') ? trimmed : `${trimmed}/api/v1`;
  }

  private normalizeAccountIds(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return [
      ...new Set(
        value
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter((item) => item.length > 0),
      ),
    ];
  }

  private extractRecords(
    response: unknown,
    keys: string[],
  ): UnipileRawRecord[] {
    if (Array.isArray(response)) {
      return response.filter(this.isRecord);
    }

    if (!this.isRecord(response)) {
      return [];
    }

    for (const key of keys) {
      const value = response[key];
      if (Array.isArray(value)) {
        return value.filter(this.isRecord);
      }
    }

    return [];
  }

  private normalizeAccount(record: UnipileRawRecord): UnipileAccount {
    const id = this.toOptionalString(record['id'] ?? record['account_id']);
    const connectionStatus = this.toOptionalString(record['connection_status']);
    const email = this.toOptionalString(record['email']);
    const name = this.toOptionalString(record['name']);
    const provider = this.toOptionalString(record['provider']);
    const status = this.toOptionalString(record['status']);
    const type = this.toOptionalString(record['type']);
    const username = this.toOptionalString(record['username']);
    if (!id) {
      throw new BadRequestException('Unipile account response is missing id');
    }

    return {
      id,
      ...(connectionStatus ? { connectionStatus } : {}),
      ...(email ? { email } : {}),
      ...(name ? { name } : {}),
      ...(provider ? { provider } : {}),
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(username ? { username } : {}),
    };
  }

  private toStatus(input: {
    config: UnipileProviderConfig;
    configured: boolean;
    source: 'environment' | 'organization';
    status: IntegrationStatus;
  }): UnipileIntegrationStatus {
    return {
      allowedAccountIds: input.config.allowedAccountIds,
      apiBaseUrl: input.config.apiBaseUrl,
      configured: input.configured,
      source: input.source,
      status: input.status,
      ...(input.config.defaultAccountId
        ? { defaultAccountId: input.config.defaultAccountId }
        : {}),
    };
  }

  private toContactPayload(
    contacts: UnipileSendEmailInput['to'] | undefined,
  ): Array<{ display_name?: string; identifier: string }> | undefined {
    if (!contacts) {
      return undefined;
    }

    return contacts.map((contact) => ({
      identifier: contact.identifier,
      ...(contact.displayName ? { display_name: contact.displayName } : {}),
    }));
  }

  private compactQuery(
    input: Record<string, string | number | boolean | undefined>,
  ): Record<string, string | number | boolean> {
    return Object.fromEntries(
      Object.entries(input).filter(
        (entry): entry is [string, string | number | boolean] =>
          entry[1] !== undefined && entry[1] !== '',
      ),
    );
  }

  private compactBody(input: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(input).filter(
        ([, value]) =>
          value !== undefined &&
          value !== '' &&
          (!Array.isArray(value) || value.length > 0),
      ),
    );
  }

  private assertAccountAllowed(
    config: UnipileProviderConfig,
    accountId: string,
  ): void {
    if (this.isAccountAllowed(config, accountId)) {
      return;
    }

    throw new BadRequestException(
      'Unipile account is not allowed for this organization',
    );
  }

  private isAccountAllowed(
    config: UnipileProviderConfig,
    accountId: string,
  ): boolean {
    return (
      config.allowedAccountIds.length === 0 ||
      config.allowedAccountIds.includes(accountId)
    );
  }

  private getConfigString(
    key: 'UNIPILE_API_BASE_URL' | 'UNIPILE_API_KEY',
  ): string | undefined {
    const value = this.configService.get(key);
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }

  private toApiStatus(value: unknown): IntegrationStatus {
    return String(value).toLowerCase() as IntegrationStatus;
  }

  private toOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }

  private toOptionalCursor(value: unknown): string | null | undefined {
    if (value === null) {
      return null;
    }

    return this.toOptionalString(value);
  }

  private isRecord(value: unknown): value is UnipileRawRecord {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
}
