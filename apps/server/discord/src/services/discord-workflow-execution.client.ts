import {
  extractWorkflowExecutionSnapshot,
  isWorkflowExecutionTerminalStatus,
} from '@genfeedai/integrations';
import type { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface DiscordWorkflowExecutionClientOptions {
  apiKey?: string;
  apiUrl: string;
  httpService: HttpService;
  pollIntervalMs: number;
  pollTimeoutMs: number;
}

/**
 * Internal workflow-execution transport for Discord bot sessions.
 */
export class DiscordWorkflowExecutionClient {
  constructor(
    private readonly options: DiscordWorkflowExecutionClientOptions,
  ) {}

  private get headers(): { Authorization: string } | undefined {
    return this.options.apiKey
      ? { Authorization: `Bearer ${this.options.apiKey}` }
      : undefined;
  }

  async create(
    orgId: string,
    workflowId: string,
    inputValues: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ): Promise<string> {
    const response = await firstValueFrom(
      this.options.httpService.post(
        `${this.options.apiUrl}/v1/internal/orgs/${orgId}/workflow-executions`,
        {
          inputValues,
          metadata,
          workflow: workflowId,
        },
        { headers: this.headers },
      ),
    );
    const execution = extractWorkflowExecutionSnapshot(response.data);

    if (!execution.executionId) {
      throw new Error('Workflow execution did not return an execution id');
    }

    return execution.executionId;
  }

  async get(orgId: string, executionId: string) {
    const response = await firstValueFrom(
      this.options.httpService.get(
        `${this.options.apiUrl}/v1/internal/orgs/${orgId}/workflow-executions/${executionId}`,
        { headers: this.headers },
      ),
    );

    return extractWorkflowExecutionSnapshot(response.data);
  }

  async cancel(orgId: string, executionId: string): Promise<void> {
    await firstValueFrom(
      this.options.httpService.post(
        `${this.options.apiUrl}/v1/internal/orgs/${orgId}/workflow-executions/${executionId}/cancel`,
        {},
        { headers: this.headers },
      ),
    );
  }

  async waitForTerminal(orgId: string, executionId: string) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < this.options.pollTimeoutMs) {
      const execution = await this.get(orgId, executionId);

      if (isWorkflowExecutionTerminalStatus(execution.status)) {
        return execution;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, this.options.pollIntervalMs),
      );
    }

    throw new Error('Workflow execution polling timed out');
  }
}
