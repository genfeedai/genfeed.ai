import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { ConfigService } from '@libs/config/config.service';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

/**
 * Shared internal HTTP helper for agent tool handlers that call the Nest API
 * with the user's auth token (images, videos, workflow schedule, trends, etc.).
 * Extracted from AgentToolExecutorService per #519.
 */
@Injectable()
export class AgentToolInternalApiService {
  private readonly apiBaseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.apiBaseUrl =
      this.configService.get('API_BASE_URL') || 'http://localhost:3010';
  }

  async callInternalApi(
    method: 'DELETE' | 'GET' | 'POST',
    path: string,
    body: Record<string, unknown> | undefined,
    ctx: ToolExecutionContext,
  ): Promise<Record<string, unknown>> {
    const url = `${this.apiBaseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (ctx.authToken) {
      headers.Authorization = `Bearer ${ctx.authToken}`;
    }

    const response = await firstValueFrom(
      method === 'POST'
        ? this.httpService.post(url, body, { headers })
        : method === 'DELETE'
          ? this.httpService.delete(url, { headers })
          : this.httpService.get(url, { headers }),
    );

    return response.data as Record<string, unknown>;
  }

  async callInternalFindOne(
    endpoint: string,
    organizationId: string,
    authToken?: string,
  ): Promise<Record<string, unknown> | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.apiBaseUrl}${endpoint}`, {
          headers: authToken
            ? {
                Authorization: `Bearer ${authToken}`,
              }
            : undefined,
          params: {
            'filters[isDeleted]': false,
            'filters[organization]': organizationId,
            'pagination[pageSize]': 1,
          },
        }),
      );

      const data = response.data?.data;
      return Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
    } catch {
      return null;
    }
  }
}
