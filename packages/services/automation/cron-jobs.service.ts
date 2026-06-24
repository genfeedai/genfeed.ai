import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

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

export const LEGACY_CRON_JOBS_RETIRED_MESSAGE =
  'Legacy cron jobs are retired. Use workflow schedules for recurring automation.';

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

  private throwRetiredMutation(): never {
    throw new Error(LEGACY_CRON_JOBS_RETIRED_MESSAGE);
  }

  async create(input: CreateCronJobInput): Promise<CronJobRecord> {
    void input;
    this.throwRetiredMutation();
  }

  async update(id: string, input: UpdateCronJobInput): Promise<CronJobRecord> {
    void id;
    void input;
    this.throwRetiredMutation();
  }

  async pause(id: string): Promise<CronJobRecord> {
    void id;
    this.throwRetiredMutation();
  }

  async resume(id: string): Promise<CronJobRecord> {
    void id;
    this.throwRetiredMutation();
  }

  async runNow(id: string): Promise<CronRunRecord> {
    void id;
    this.throwRetiredMutation();
  }

  async delete(id: string): Promise<CronJobRecord> {
    void id;
    this.throwRetiredMutation();
  }

  async testWebhook(input: {
    webhookUrl?: string;
    webhookSecret?: string;
    webhookHeaders?: Record<string, string>;
  }): Promise<Record<string, unknown>> {
    void input;
    this.throwRetiredMutation();
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
