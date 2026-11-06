import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it } from 'vitest';
import type { WebhookDispatchService } from './webhook-dispatch.service';
import { WorkflowEventWebhookService } from './workflow-event-webhook.service';

interface Dispatch {
  options: Record<string, unknown>;
  organizationId: string;
  payload: Record<string, unknown>;
}

interface LogEntry {
  context: Record<string, unknown>;
  level: 'error' | 'warn';
  message: string;
}

function makeService(dispatchFailure?: Error) {
  const dispatches: Dispatch[] = [];
  const logs: LogEntry[] = [];
  const record =
    (level: LogEntry['level']) =>
    (message: string, context: Record<string, unknown>) => {
      logs.push({ context, level, message });
    };
  const service = new WorkflowEventWebhookService(
    {
      error: record('error'),
      log: () => undefined,
      warn: record('warn'),
    } as unknown as LoggerService,
    {
      dispatch: async (
        organizationId: string,
        payload: Record<string, unknown>,
        options: Record<string, unknown>,
      ) => {
        if (dispatchFailure) {
          throw dispatchFailure;
        }
        dispatches.push({ options, organizationId, payload });
        return null;
      },
    } as unknown as WebhookDispatchService,
  );

  return { dispatches, logs, service };
}

describe('WorkflowEventWebhookService', () => {
  const occurredAt = new Date('2026-07-07T10:00:00.000Z');
  const startedAt = new Date('2026-07-07T09:58:00.000Z');

  it('emits a completed execution with a deterministic event id', async () => {
    const { dispatches, service } = makeService();

    await service.emitExecutionOutcome({
      completedAt: occurredAt,
      creditsUsed: 12,
      durationMs: 120_000,
      executionId: 'execution_1',
      occurredAt,
      organizationId: 'org_123',
      progress: 100,
      startedAt,
      status: WorkflowExecutionStatus.COMPLETED,
      trigger: 'scheduled',
      workflowId: 'workflow_1',
    });

    expect(dispatches).toEqual([
      {
        options: expect.objectContaining({ jobIdPrefix: 'workflow-webhook-' }),
        organizationId: 'org_123',
        payload: {
          event: 'workflow.execution.completed',
          eventId:
            'workflow:workflow.execution.completed:workflow_1:execution_1:completed',
          execution: {
            completedAt: '2026-07-07T10:00:00.000Z',
            creditsUsed: 12,
            durationMs: 120_000,
            error: null,
            failedNodeId: null,
            id: 'execution_1',
            progress: 100,
            startedAt: '2026-07-07T09:58:00.000Z',
            status: WorkflowExecutionStatus.COMPLETED,
            trigger: 'scheduled',
            workflowId: 'workflow_1',
          },
          occurredAt: '2026-07-07T10:00:00.000Z',
          schemaVersion: 1,
          timestamp: '2026-07-07T10:00:00.000Z',
        },
      },
    ]);
  });

  it('classifies and redacts a failed execution', async () => {
    const { dispatches, service } = makeService();

    await service.emitExecutionOutcome({
      errorMessage: 'Provider unavailable api_key=raw-api-key',
      executionId: 'execution_1',
      failedNodeId: 'node_3',
      occurredAt,
      organizationId: 'org_123',
      status: WorkflowExecutionStatus.FAILED,
      workflowId: 'workflow_1',
    });

    const payload = dispatches[0]?.payload;
    expect(payload).toMatchObject({
      event: 'workflow.execution.failed',
      eventId:
        'workflow:workflow.execution.failed:workflow_1:execution_1:failed',
      execution: {
        creditsUsed: 0,
        durationMs: null,
        error: {
          class: 'provider_outage',
          message: 'Provider unavailable api_key=[REDACTED]',
          retryable: false,
        },
        failedNodeId: 'node_3',
        progress: 0,
        startedAt: null,
      },
    });
    expect(JSON.stringify(payload)).not.toContain('raw-api-key');
  });

  it('drops an unrecognized trigger rather than failing the payload', async () => {
    const { dispatches, service } = makeService();

    await service.emitExecutionOutcome({
      executionId: 'execution_1',
      organizationId: 'org_123',
      status: WorkflowExecutionStatus.COMPLETED,
      trigger: 'not-a-trigger',
      workflowId: 'workflow_1',
    });

    expect(dispatches[0]?.payload).toEqual(
      expect.objectContaining({
        execution: expect.objectContaining({ trigger: null }),
      }),
    );
  });

  it.each([WorkflowExecutionStatus.RUNNING, WorkflowExecutionStatus.PENDING])(
    'stays silent for the non-terminal %s status',
    async (status) => {
      const { dispatches, service } = makeService();

      await service.emitExecutionOutcome({
        executionId: 'execution_1',
        organizationId: 'org_123',
        status,
        workflowId: 'workflow_1',
      });

      expect(dispatches).toEqual([]);
    },
  );

  it('skips emission when the organization is missing', async () => {
    const { dispatches, logs, service } = makeService();

    await service.emitExecutionOutcome({
      executionId: 'execution_1',
      organizationId: '',
      status: WorkflowExecutionStatus.COMPLETED,
      workflowId: 'workflow_1',
    });

    expect(dispatches).toEqual([]);
    expect(logs).toEqual([
      {
        context: expect.objectContaining({ hasOrganizationId: false }),
        level: 'warn',
        message: expect.stringContaining('skipped workflow webhook'),
      },
    ]);
  });

  it('never fails the execution when dispatch throws', async () => {
    const { logs, service } = makeService(
      new Error('Queue unavailable webhook_secret=raw-webhook-secret'),
    );

    await expect(
      service.emitExecutionOutcome({
        executionId: 'execution_1',
        organizationId: 'org_123',
        status: WorkflowExecutionStatus.COMPLETED,
        workflowId: 'workflow_1',
      }),
    ).resolves.toBeUndefined();

    expect(logs).toEqual([
      {
        context: expect.objectContaining({
          error: 'Queue unavailable webhook_secret=[REDACTED]',
          executionId: 'execution_1',
        }),
        level: 'error',
        message: expect.stringContaining(
          'failed to emit workflow execution event',
        ),
      },
    ]);
  });
});
