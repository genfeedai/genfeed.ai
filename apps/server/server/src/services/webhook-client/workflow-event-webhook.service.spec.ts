import { WorkflowExecutionStatus } from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';
import type { WebhookDispatchService } from './webhook-dispatch.service';
import { WorkflowEventWebhookService } from './workflow-event-webhook.service';

function makeService() {
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const webhookDispatchService = {
    dispatch: vi.fn().mockResolvedValue(null),
  };
  const service = new WorkflowEventWebhookService(
    logger as unknown as LoggerService,
    webhookDispatchService as unknown as WebhookDispatchService,
  );

  return { logger, service, webhookDispatchService };
}

describe('WorkflowEventWebhookService', () => {
  const occurredAt = new Date('2026-07-07T10:00:00.000Z');
  const startedAt = new Date('2026-07-07T09:58:00.000Z');

  it('emits a completed execution with a deterministic event id', async () => {
    const { service, webhookDispatchService } = makeService();

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

    expect(webhookDispatchService.dispatch).toHaveBeenCalledWith(
      'org_123',
      {
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
      expect.objectContaining({ jobIdPrefix: 'workflow-webhook-' }),
    );
  });

  it('classifies and redacts a failed execution', async () => {
    const { service, webhookDispatchService } = makeService();

    await service.emitExecutionOutcome({
      errorMessage: 'Provider unavailable api_key=raw-api-key',
      executionId: 'execution_1',
      failedNodeId: 'node_3',
      occurredAt,
      organizationId: 'org_123',
      status: WorkflowExecutionStatus.FAILED,
      workflowId: 'workflow_1',
    });

    const payload = webhookDispatchService.dispatch.mock.calls[0][1];
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
    const { service, webhookDispatchService } = makeService();

    await service.emitExecutionOutcome({
      executionId: 'execution_1',
      organizationId: 'org_123',
      status: WorkflowExecutionStatus.COMPLETED,
      trigger: 'not-a-trigger',
      workflowId: 'workflow_1',
    });

    expect(webhookDispatchService.dispatch).toHaveBeenCalledWith(
      'org_123',
      expect.objectContaining({
        execution: expect.objectContaining({ trigger: null }),
      }),
      expect.anything(),
    );
  });

  it.each([WorkflowExecutionStatus.RUNNING, WorkflowExecutionStatus.PENDING])(
    'stays silent for the non-terminal %s status',
    async (status) => {
      const { service, webhookDispatchService } = makeService();

      await service.emitExecutionOutcome({
        executionId: 'execution_1',
        organizationId: 'org_123',
        status,
        workflowId: 'workflow_1',
      });

      expect(webhookDispatchService.dispatch).not.toHaveBeenCalled();
    },
  );

  it('skips emission when the organization is missing', async () => {
    const { logger, service, webhookDispatchService } = makeService();

    await service.emitExecutionOutcome({
      executionId: 'execution_1',
      organizationId: '',
      status: WorkflowExecutionStatus.COMPLETED,
      workflowId: 'workflow_1',
    });

    expect(webhookDispatchService.dispatch).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('skipped workflow webhook'),
      expect.objectContaining({ hasOrganizationId: false }),
    );
  });

  it('never fails the execution when dispatch throws', async () => {
    const { logger, service, webhookDispatchService } = makeService();
    webhookDispatchService.dispatch.mockRejectedValue(
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

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('failed to emit workflow execution event'),
      expect.objectContaining({
        error: 'Queue unavailable webhook_secret=[REDACTED]',
        executionId: 'execution_1',
      }),
    );
  });
});
