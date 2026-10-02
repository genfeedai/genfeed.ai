import { CacheService } from '@api/services/cache/cache.service';
import {
  type CrunEstimateResponse,
  type CrunResponse,
  type CrunTaskStatusResponse,
  parseCrunCreateTask,
  parseCrunEstimate,
  parseCrunTaskInfo,
} from '@api/services/integrations/crun/crun-response.schema';
import type {
  CrunProviderRequest,
  CrunResolvedCredential,
} from '@api/services/integrations/crun/crun-task.schema';
import { Injectable } from '@nestjs/common';

export type CrunClientResult<T> =
  | { isValid: true; data: T }
  | {
      isValid: false;
      reasonCode: string;
      disposition: 'deferred' | 'refused' | 'ambiguous' | 'recovery';
      retryAfterMs: number;
    };

const REFUSALS = new Set([401, 402, 422, 429, 455, 505]);
const BASE = 'https://api.crun.ai/api/v1/client/job/';

@Injectable()
export class CrunClient {
  constructor(private readonly cache: CacheService) {}

  createTask(credential: CrunResolvedCredential, request: CrunProviderRequest) {
    return this.request(
      credential,
      'CreateTask',
      request,
      true,
      parseCrunCreateTask,
    );
  }

  estimate(credential: CrunResolvedCredential, request: CrunProviderRequest) {
    return this.request<CrunEstimateResponse>(
      credential,
      'estimate-credits',
      request,
      false,
      parseCrunEstimate,
    );
  }

  taskInfo(credential: CrunResolvedCredential, taskId: string) {
    return this.request<CrunTaskStatusResponse>(
      credential,
      `TaskInfo?task_id=${encodeURIComponent(taskId)}`,
      undefined,
      false,
      (status, body) => parseCrunTaskInfo(status, body, taskId),
    );
  }

  private async request<T>(
    credential: CrunResolvedCredential,
    path: string,
    input: CrunProviderRequest | undefined,
    isCreate: boolean,
    parse: (status: number, body: unknown) => CrunResponse<T>,
  ): Promise<CrunClientResult<T>> {
    const slot = await this.cache.claimCrunRequestSlot(
      credential.credentialFingerprint,
    );
    if (!slot?.isAdmitted)
      return {
        isValid: false,
        reasonCode: slot ? 'CRUN_RATE_LIMITED' : 'CRUN_GATE_UNAVAILABLE',
        disposition: 'deferred',
        retryAfterMs: slot?.retryAfterMs ?? 30000,
      };
    try {
      // Exactly one request. CreateTask is never automatically retried.
      const response = await fetch(`${BASE}${path}`, {
        method: input ? 'POST' : 'GET',
        headers: {
          'X-API-KEY': credential.apiKey,
          'Content-Type': 'application/json',
        },
        ...(input ? { body: JSON.stringify(input) } : {}),
        signal: AbortSignal.timeout(15000),
        redirect: 'error',
      });
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      const applicationCode =
        body &&
        typeof body === 'object' &&
        'code' in body &&
        typeof body.code === 'number'
          ? body.code
          : undefined;
      const refusal =
        REFUSALS.has(response.status) ||
        (applicationCode !== undefined && REFUSALS.has(applicationCode));
      if (refusal)
        return {
          isValid: false,
          reasonCode: `CRUN_REFUSED_${applicationCode ?? response.status}`,
          disposition: isCreate
            ? 'refused'
            : response.status === 429 || applicationCode === 429
              ? 'deferred'
              : 'recovery',
          retryAfterMs: this.retryAfter(response.headers.get('retry-after')),
        };
      if (!isCreate && response.status === 404)
        return {
          isValid: false,
          reasonCode: 'CRUN_TASK_NOT_FOUND',
          disposition: 'deferred',
          retryAfterMs: 30000,
        };
      const parsed = parse(response.status, body);
      if (parsed.isValid) return parsed;
      return {
        ...parsed,
        disposition: isCreate ? 'ambiguous' : 'recovery',
        retryAfterMs: 0,
      };
    } catch {
      return {
        isValid: false,
        reasonCode: 'CRUN_TRANSPORT_UNAVAILABLE',
        disposition: isCreate ? 'ambiguous' : 'deferred',
        retryAfterMs: 30000,
      };
    }
  }

  private retryAfter(value: string | null): number {
    if (!value) return 30000;
    const seconds = Number(value);
    const delay =
      Number.isFinite(seconds) && seconds >= 0
        ? seconds * 1000
        : Date.parse(value) - Date.now();
    return Number.isFinite(delay) ? Math.max(30000, delay) : 30000;
  }
}
