import type { ToolExecutionContext } from '@server/services/agent-orchestrator/tools/agent-tool-executor.service';
import { ConfigService } from '@libs/config/config.service';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

function readJsonApiDetail(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const errors = (payload as { errors?: unknown }).errors;
  if (Array.isArray(errors) && errors[0] && typeof errors[0] === 'object') {
    const first = errors[0] as { detail?: unknown; title?: unknown };
    if (typeof first.detail === 'string' && first.detail.trim()) {
      return first.detail.trim();
    }
    if (typeof first.title === 'string' && first.title.trim()) {
      return first.title.trim();
    }
  }

  const message = (payload as { message?: unknown }).message;
  return typeof message === 'string' && message.trim() ? message.trim() : null;
}

function formatInternalApiError(error: unknown): string {
  if (typeof error !== 'object' || error === null) {
    return 'Internal API request failed';
  }

  const response = 'response' in error ? error.response : undefined;
  const status =
    typeof response === 'object' &&
    response !== null &&
    'status' in response &&
    typeof response.status === 'number'
      ? response.status
      : undefined;
  const data =
    typeof response === 'object' && response !== null && 'data' in response
      ? response.data
      : undefined;
  const detail = readJsonApiDetail(data);
  const fallback =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : 'Internal API request failed';

  if (status && detail) {
    return `Request failed with status code ${status}: ${detail}`;
  }
  if (detail) {
    return detail;
  }
  return fallback;
}

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
    this.apiBaseUrl = String(
      this.configService.get('GENFEEDAI_API_URL') || 'http://localhost:3010',
    ).replace(/\/+$/, '');
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

    try {
      const response = await firstValueFrom(
        method === 'POST'
          ? this.httpService.post(url, body, { headers })
          : method === 'DELETE'
            ? this.httpService.delete(url, { headers })
            : this.httpService.get(url, { headers }),
      );

      return response.data as Record<string, unknown>;
    } catch (error) {
      throw new Error(formatInternalApiError(error));
    }
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
            'filters[organizationId]': organizationId,
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
