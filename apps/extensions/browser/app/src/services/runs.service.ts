import { EnvironmentService } from '~services/environment.service';
import { HTTPBaseService } from '~services/http-base.service';

export type RunActionType = 'generate' | 'post' | 'analytics' | 'composite';
export type RunTrigger = 'manual' | 'api' | 'scheduled' | 'event' | 'agent';
export type RunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface RunEventRecord {
  type: string;
  message?: string;
  payload?: Record<string, unknown>;
  source?: string;
  createdAt: string;
}

export interface RunRecord {
  _id?: string;
  id?: string;
  actionType: RunActionType;
  status: RunStatus;
  progress: number;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface CreateRunResponse {
  reused: boolean;
  run: RunRecord;
}

interface CreateAndExecuteOptions {
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
  trigger?: RunTrigger;
  correlationId?: string;
}

export class RunsService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/runs`, token);
  }

  async createRun(
    actionType: RunActionType,
    input: Record<string, unknown>,
    options: CreateAndExecuteOptions = {},
  ): Promise<RunRecord> {
    const response = await this.instance.post<CreateRunResponse>('', {
      actionType,
      correlationId: options.correlationId,
      idempotencyKey: options.idempotencyKey,
      input,
      metadata: options.metadata,
      surface: 'extension',
      trigger: options.trigger || 'manual',
    });

    return response.data.run;
  }

  async executeRun(runId: string): Promise<RunRecord> {
    const response = await this.instance.post<RunRecord>(`/${runId}/execute`);
    return response.data;
  }

  async getRun(runId: string): Promise<RunRecord> {
    const response = await this.instance.get<RunRecord>(`/${runId}`);
    return response.data;
  }

  async getRunEvents(runId: string): Promise<RunEventRecord[]> {
    const response = await this.instance.get<RunEventRecord[]>(
      `/${runId}/events`,
    );
    return response.data;
  }

  async createAndExecuteRun(
    actionType: RunActionType,
    input: Record<string, unknown>,
    options: CreateAndExecuteOptions = {},
  ): Promise<RunRecord> {
    const created = await this.createRun(actionType, input, options);
    const runId = created._id || created.id;

    if (!runId) {
      throw new Error('Run id missing from create response.');
    }

    return this.executeRun(runId);
  }
}

export function isTerminalRunStatus(status: RunStatus): boolean {
  return (
    status === 'completed' || status === 'failed' || status === 'cancelled'
  );
}
