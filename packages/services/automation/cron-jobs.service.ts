import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@genfeedai/helpers/data/json-api/json-api.helper';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

export type CronJobType =
  | 'workflow_execution'
  | 'agent_strategy_execution'
  | 'newsletter_substack';

export interface CronJobRecord {
  id: string;
  name: string;
  jobType: CronJobType;
  enabled: boolean;
  schedule: string;
  timezone: string;
  payload: Record<string, unknown>;
  lastRunAt?: string;
  lastStatus: 'never' | 'running' | 'success' | 'failed';
  nextRunAt?: string;
  consecutiveFailures: number;
  maxRetries: number;
  retryBackoffMinutes: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CronRunRecord {
  id: string;
  cronJob: string;
  status: 'queued' | 'running' | 'success' | 'failed';
  trigger: 'scheduled' | 'manual';
  startedAt?: string;
  endedAt?: string;
  error?: string;
  artifacts?: Record<string, unknown>;
}

export interface CreateCronJobInput {
  name: string;
  jobType: CronJobType;
  schedule: string;
  timezone?: string;
  enabled?: boolean;
  maxRetries?: number;
  retryBackoffMinutes?: number;
  payload?: Record<string, unknown>;
}

export type UpdateCronJobInput = Partial<CreateCronJobInput>;

export class CronJobsService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/cron-jobs`, token);
  }

  public static getInstance(token: string): CronJobsService {
    return HTTPBaseService.getBaseServiceInstance(
      CronJobsService,
      token,
    ) as CronJobsService;
  }

  async list(): Promise<CronJobRecord[]> {
    const response = await this.instance.get<JsonApiResponseDocument>('');
    return deserializeCollection<CronJobRecord>(response.data);
  }

  async create(input: CreateCronJobInput): Promise<CronJobRecord> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      '',
      input,
    );
    return deserializeResource<CronJobRecord>(response.data);
  }

  async update(id: string, input: UpdateCronJobInput): Promise<CronJobRecord> {
    const response = await this.instance.patch<JsonApiResponseDocument>(
      `/${id}`,
      input,
    );
    return deserializeResource<CronJobRecord>(response.data);
  }

  async pause(id: string): Promise<CronJobRecord> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/${id}/pause`,
    );
    return deserializeResource<CronJobRecord>(response.data);
  }

  async resume(id: string): Promise<CronJobRecord> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/${id}/resume`,
    );
    return deserializeResource<CronJobRecord>(response.data);
  }

  async runNow(id: string): Promise<CronRunRecord> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/${id}/run-now`,
    );
    return deserializeResource<CronRunRecord>(response.data);
  }

  async delete(id: string): Promise<CronJobRecord> {
    const response = await this.instance.delete<JsonApiResponseDocument>(
      `/${id}`,
    );
    return deserializeResource<CronJobRecord>(response.data);
  }

  async testWebhook(input: {
    webhookUrl?: string;
    webhookSecret?: string;
    webhookHeaders?: Record<string, string>;
  }): Promise<Record<string, unknown>> {
    const response = await this.instance.post<Record<string, unknown>>(
      '/test-webhook',
      input,
    );
    return response.data;
  }

  async runs(id: string): Promise<CronRunRecord[]> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      `/${id}/runs`,
    );
    return deserializeCollection<CronRunRecord>(response.data);
  }

  async run(id: string, runId: string): Promise<CronRunRecord> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      `/${id}/runs/${runId}`,
    );
    return deserializeResource<CronRunRecord>(response.data);
  }
}
