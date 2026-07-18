import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import type { ApiKeyDocument } from '@api/collections/api-keys/schemas/api-key.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { API_KEY_SCOPE_PRESETS } from '@genfeedai/constants';
import type {
  ConnectGenfeedVerificationFailureResult,
  ConnectGenfeedVerificationResult,
} from '@genfeedai/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';

const MCP_VERIFICATION_TIMEOUT_MS = 5_000;

interface McpJsonRpcResponse {
  error?: {
    code?: number;
    message?: string;
  };
  id?: string;
  jsonrpc?: string;
  result?: {
    tools?: unknown[];
  };
}

interface HttpRequestError {
  code?: string;
  response?: {
    status?: number;
  };
}

interface McpConnectionVerificationInput {
  apiKeyId: string;
  organizationId: string;
  plainKey: string;
  userId: string;
}

@Injectable()
export class McpConnectionVerificationService {
  private readonly http: AxiosInstance = axios.create();

  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly configService: ConfigService,
    private readonly credentialsService: CredentialsService,
    private readonly logger: LoggerService,
  ) {}

  async verify(
    input: McpConnectionVerificationInput,
  ): Promise<ConnectGenfeedVerificationResult> {
    const apiKey = await this.apiKeysService.findOne({
      id: input.apiKeyId,
      isRevoked: false,
      organizationId: input.organizationId,
      userId: input.userId,
    });

    if (!apiKey || this.isExpired(apiKey)) {
      return this.failure(
        'invalid_key',
        'The selected API key is missing, expired, or revoked.',
      );
    }

    const matches = await this.apiKeysService.verifyApiKey(
      input.plainKey,
      apiKey.key,
    );
    if (!matches) {
      return this.failure(
        'invalid_key',
        'The supplied key does not match the selected API key.',
      );
    }

    const missingScopes = API_KEY_SCOPE_PRESETS.mcp.filter(
      (scope) => !apiKey.scopes.includes(scope),
    );
    if (missingScopes.length > 0) {
      return {
        message:
          'The selected key does not include every scope required by the guided MCP distribution flow.',
        missingScopes,
        reason: 'invalid_scope',
        status: 'failed',
      };
    }

    const probeResult = await this.probeMcp(input.plainKey);
    if (probeResult) {
      return probeResult;
    }

    const verifiedAt = new Date().toISOString();
    const connectedAccountCount =
      await this.credentialsService.countConnected(input.organizationId);
    const latestApiKey = await this.apiKeysService.findOne({
      id: input.apiKeyId,
      isRevoked: false,
      organizationId: input.organizationId,
      userId: input.userId,
    });
    const metadata = this.readMetadata(latestApiKey?.metadata ?? apiKey.metadata);

    await this.apiKeysService.patch(input.apiKeyId, {
      metadata: {
        ...metadata,
        connectGenfeed: {
          lastVerifiedAt: verifiedAt,
          transport: 'streamable-http',
        },
      },
    });

    return {
      keyId: input.apiKeyId,
      publishing: {
        connectedAccountCount,
        isReady: connectedAccountCount > 0,
      },
      status: 'connected',
      verifiedAt,
    };
  }

  private async probeMcp(
    plainKey: string,
  ): Promise<ConnectGenfeedVerificationFailureResult | null> {
    const endpoint = this.getMcpEndpoint();
    if (!endpoint) {
      this.logger.warn('MCP verification endpoint is not configured');
      return this.failure(
        'unreachable_endpoint',
        'Automatic MCP verification is not configured for this deployment. Use the manual verification instructions.',
      );
    }

    try {
      const response = await this.http.post<McpJsonRpcResponse>(
        endpoint,
        {
          id: 'connect-genfeed-verification',
          jsonrpc: '2.0',
          method: 'tools/list',
          params: {},
        },
        {
          headers: {
            Accept: 'application/json, text/event-stream',
            Authorization: `Bearer ${plainKey}`,
            'Content-Type': 'application/json',
          },
          timeout: MCP_VERIFICATION_TIMEOUT_MS,
        },
      );

      const body = response.data;
      if (this.hasDiscoveredTools(body)) {
        return null;
      }

      this.logger.warn(
        'MCP protocol discovery requires a client lifecycle; trying the authenticated registry mirror',
        { hasError: Boolean(body.error) },
      );
    } catch (error: unknown) {
      const authFailure = this.readAuthFailure(error);
      if (authFailure) {
        return authFailure;
      }

      const requestError = error as HttpRequestError;
      this.logger.warn('MCP verification probe failed', {
        code: requestError.code,
        status: requestError.response?.status,
      });
    }

    return this.probeToolRegistry(endpoint, plainKey);
  }

  private async probeToolRegistry(
    mcpEndpoint: string,
    plainKey: string,
  ): Promise<ConnectGenfeedVerificationFailureResult | null> {
    try {
      const response = await this.http.get<{ tools?: unknown[] }>(
        this.getToolsEndpoint(mcpEndpoint),
        {
          headers: {
            Authorization: `Bearer ${plainKey}`,
          },
          timeout: MCP_VERIFICATION_TIMEOUT_MS,
        },
      );

      if (Array.isArray(response.data.tools)) {
        return null;
      }

      this.logger.warn(
        'MCP tool-registry mirror returned an invalid response',
      );
    } catch (error: unknown) {
      const authFailure = this.readAuthFailure(error);
      if (authFailure) {
        return authFailure;
      }

      const requestError = error as HttpRequestError;
      this.logger.warn('MCP tool-registry verification failed', {
        code: requestError.code,
        status: requestError.response?.status,
      });
    }

    return this.failure(
      'unreachable_endpoint',
      'The MCP endpoint is currently unreachable. Use the manual verification instructions and try again.',
    );
  }

  private readAuthFailure(
    error: unknown,
  ): ConnectGenfeedVerificationFailureResult | null {
    const status = (error as HttpRequestError).response?.status;

    if (status === 401) {
      return this.failure(
        'invalid_key',
        'The MCP server rejected the selected API key.',
      );
    }

    if (status === 403) {
      return this.failure(
        'invalid_scope',
        'The MCP server rejected the selected key scopes.',
      );
    }

    return null;
  }

  private hasDiscoveredTools(body: McpJsonRpcResponse): boolean {
    return (
      body.jsonrpc === '2.0' &&
      body.id === 'connect-genfeed-verification' &&
      Array.isArray(body.result?.tools)
    );
  }

  private getToolsEndpoint(mcpEndpoint: string): string {
    const url = new URL(mcpEndpoint);
    const basePath = url.pathname.replace(/\/mcp\/?$/, '');
    url.pathname = `${basePath}/v1/tools`.replace(/\/+/g, '/');
    url.search = '';

    return url.toString();
  }

  private getMcpEndpoint(): string | null {
    const configured = this.configService.get(
      'GENFEEDAI_MICROSERVICES_MCP_URL',
    );
    const baseUrl = typeof configured === 'string' ? configured.trim() : '';
    if (!baseUrl) {
      return null;
    }

    const normalized = baseUrl.replace(/\/+$/, '');
    const endpoint = normalized.endsWith('/mcp')
      ? normalized
      : `${normalized}/mcp`;

    try {
      const url = new URL(endpoint);
      return url.protocol === 'http:' || url.protocol === 'https:'
        ? endpoint
        : null;
    } catch {
      return null;
    }
  }

  private isExpired(apiKey: ApiKeyDocument): boolean {
    return apiKey.expiresAt != null && apiKey.expiresAt.getTime() <= Date.now();
  }

  private readMetadata(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private failure(
    reason: ConnectGenfeedVerificationFailureResult['reason'],
    message: string,
  ): ConnectGenfeedVerificationFailureResult {
    return {
      message,
      reason,
      status: 'failed',
    };
  }
}
