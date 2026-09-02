import { describe, expect, test } from 'vitest';
import { WorkflowExecutionStatus, WorkflowExecutionTrigger } from '../../src';
import {
  classifyWorkflowWebhookError,
  createSampleWorkflowWebhookPayload,
  createWorkflowWebhookEventId,
  WORKFLOW_WEBHOOK_SCHEMA_VERSION,
  workflowWebhookPayloadSchema,
} from '../../src/api-types/contracts/workflow-webhook-events.contract';

const completedPayload = {
  event: 'workflow.execution.completed',
  eventId:
    'workflow:workflow.execution.completed:workflow_123:execution_123:completed',
  execution: {
    completedAt: '2026-07-07T10:00:00.000Z',
    creditsUsed: 12,
    durationMs: 120_000,
    error: null,
    failedNodeId: null,
    id: 'execution_123',
    progress: 100,
    startedAt: '2026-07-07T09:58:00.000Z',
    status: WorkflowExecutionStatus.COMPLETED,
    trigger: WorkflowExecutionTrigger.SCHEDULED,
    workflowId: 'workflow_123',
  },
  occurredAt: '2026-07-07T10:00:00.000Z',
  schemaVersion: WORKFLOW_WEBHOOK_SCHEMA_VERSION,
  timestamp: '2026-07-07T10:00:00.000Z',
};

describe('workflowWebhookPayloadSchema', () => {
  test('accepts a versioned completed execution payload', () => {
    expect(
      workflowWebhookPayloadSchema.safeParse(completedPayload).success,
    ).toBe(true);
  });

  test('rejects a non-terminal execution status', () => {
    const result = workflowWebhookPayloadSchema.safeParse({
      ...completedPayload,
      execution: {
        ...completedPayload.execution,
        status: WorkflowExecutionStatus.RUNNING,
      },
    });

    expect(result.success).toBe(false);
  });

  test('rejects a completed event carrying a failed execution', () => {
    const result = workflowWebhookPayloadSchema.safeParse({
      ...completedPayload,
      execution: {
        ...completedPayload.execution,
        status: WorkflowExecutionStatus.FAILED,
      },
    });

    expect(result.success).toBe(false);
  });

  test('requires an error on failed execution payloads', () => {
    const result = workflowWebhookPayloadSchema.safeParse({
      ...completedPayload,
      event: 'workflow.execution.failed',
      eventId:
        'workflow:workflow.execution.failed:workflow_123:execution_123:failed',
      execution: {
        ...completedPayload.execution,
        status: WorkflowExecutionStatus.FAILED,
      },
    });

    expect(result.success).toBe(false);
  });

  test('rejects progress outside the 0-100 range', () => {
    const result = workflowWebhookPayloadSchema.safeParse({
      ...completedPayload,
      execution: { ...completedPayload.execution, progress: 140 },
    });

    expect(result.success).toBe(false);
  });

  test('accepts a classified execution failure payload snapshot', () => {
    const result = workflowWebhookPayloadSchema.safeParse({
      event: 'workflow.execution.failed',
      eventId:
        'workflow:workflow.execution.failed:workflow_123:execution_123:failed',
      execution: {
        completedAt: '2026-07-07T10:00:00.000Z',
        creditsUsed: 4,
        durationMs: 30_000,
        error: {
          class: 'provider_outage',
          code: 'provider_outage',
          message: 'Provider timed out',
          retryable: false,
        },
        failedNodeId: 'node_3',
        id: 'execution_123',
        progress: 40,
        startedAt: '2026-07-07T09:59:30.000Z',
        status: WorkflowExecutionStatus.FAILED,
        trigger: WorkflowExecutionTrigger.API,
        workflowId: 'workflow_123',
      },
      occurredAt: '2026-07-07T10:00:00.000Z',
      schemaVersion: WORKFLOW_WEBHOOK_SCHEMA_VERSION,
      timestamp: '2026-07-07T10:00:00.000Z',
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error('Expected execution failure payload to parse');
    }
    expect(result.data).toMatchInlineSnapshot(`
      {
        "event": "workflow.execution.failed",
        "eventId": "workflow:workflow.execution.failed:workflow_123:execution_123:failed",
        "execution": {
          "completedAt": "2026-07-07T10:00:00.000Z",
          "creditsUsed": 4,
          "durationMs": 30000,
          "error": {
            "class": "provider_outage",
            "code": "provider_outage",
            "message": "Provider timed out",
            "retryable": false,
          },
          "failedNodeId": "node_3",
          "id": "execution_123",
          "progress": 40,
          "startedAt": "2026-07-07T09:59:30.000Z",
          "status": "FAILED",
          "trigger": "api",
          "workflowId": "workflow_123",
        },
        "occurredAt": "2026-07-07T10:00:00.000Z",
        "schemaVersion": 1,
        "timestamp": "2026-07-07T10:00:00.000Z",
      }
    `);
  });
});

describe('workflow webhook helpers', () => {
  test.each([
    'workflow.execution.completed',
    'workflow.execution.failed',
  ] as const)('builds a schema-valid sample payload for %s', (event) => {
    const payload = createSampleWorkflowWebhookPayload({
      event,
      executionId: 'execution_test',
      occurredAt: '2026-07-07T10:00:00.000Z',
      workflowId: 'workflow_test',
    });

    expect(payload.event).toBe(event);
    expect(workflowWebhookPayloadSchema.safeParse(payload).success).toBe(true);
  });

  test('creates deterministic event ids per outcome', () => {
    expect(
      createWorkflowWebhookEventId({
        event: 'workflow.execution.completed',
        executionId: 'Execution 123',
        status: WorkflowExecutionStatus.COMPLETED,
        workflowId: 'Workflow 123',
      }),
    ).toBe(
      'workflow:workflow.execution.completed:workflow-123:execution-123:completed',
    );

    expect(
      createWorkflowWebhookEventId({
        event: 'workflow.execution.failed',
        executionId: 'Execution 123',
        status: WorkflowExecutionStatus.FAILED,
        workflowId: 'Workflow 123',
      }),
    ).toBe(
      'workflow:workflow.execution.failed:workflow-123:execution-123:failed',
    );
  });

  test.each([
    ['workflow node configuration missing', 'misconfiguration'],
    ['credential token expired mid-run', 'credential'],
    ['provider timeout with 503', 'provider_outage'],
    ['quota exceeded', 'rate_limit'],
    ['unsupported node type', 'validation'],
    ['unexpected engine failure', 'unknown'],
  ] as const)('classifies "%s" as %s', (message, expectedErrorClass) => {
    expect(classifyWorkflowWebhookError(message)).toBe(expectedErrorClass);
  });
});
