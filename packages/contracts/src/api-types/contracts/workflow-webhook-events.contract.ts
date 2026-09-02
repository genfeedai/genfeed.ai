import { z } from 'zod';
import { WorkflowExecutionStatus, WorkflowExecutionTrigger } from '../..';
import {
  classifyWebhookError,
  createWebhookEventId,
  redactWebhookText,
  type WebhookErrorClass,
  webhookErrorSchema,
  webhookIsoDateTimeSchema,
  webhookNullableStringSchema,
} from './webhook-events.shared';

export const WORKFLOW_WEBHOOK_SCHEMA_VERSION = 1;

export const WORKFLOW_WEBHOOK_EVENT_TYPES = [
  'workflow.execution.completed',
  'workflow.execution.failed',
] as const;

export const workflowWebhookEventTypeSchema = z.enum(
  WORKFLOW_WEBHOOK_EVENT_TYPES,
);

export const workflowWebhookExecutionStatusSchema = z.enum([
  WorkflowExecutionStatus.COMPLETED,
  WorkflowExecutionStatus.FAILED,
] as const);

export const workflowWebhookTriggerSchema = z.enum(WorkflowExecutionTrigger);

export const workflowWebhookExecutionSchema = z.object({
  completedAt: webhookNullableStringSchema,
  creditsUsed: z.number().nonnegative(),
  durationMs: z.number().int().nonnegative().nullable().optional(),
  error: webhookErrorSchema.nullable().optional(),
  failedNodeId: webhookNullableStringSchema,
  id: z.string().min(1),
  progress: z.number().int().min(0).max(100),
  startedAt: webhookNullableStringSchema,
  status: workflowWebhookExecutionStatusSchema,
  trigger: workflowWebhookTriggerSchema.nullable().optional(),
  workflowId: z.string().min(1),
});

export const workflowWebhookPayloadSchema = z
  .object({
    event: workflowWebhookEventTypeSchema,
    eventId: z.string().min(1),
    execution: workflowWebhookExecutionSchema,
    occurredAt: webhookIsoDateTimeSchema,
    schemaVersion: z.literal(WORKFLOW_WEBHOOK_SCHEMA_VERSION),
    timestamp: webhookIsoDateTimeSchema,
  })
  .superRefine((payload, ctx) => {
    if (
      payload.event === 'workflow.execution.failed' &&
      !payload.execution.error
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'workflow.execution.failed requires execution.error',
        path: ['execution', 'error'],
      });
    }

    const expectedStatus =
      payload.event === 'workflow.execution.failed'
        ? WorkflowExecutionStatus.FAILED
        : WorkflowExecutionStatus.COMPLETED;
    if (payload.execution.status !== expectedStatus) {
      ctx.addIssue({
        code: 'custom',
        message: `${payload.event} requires execution.status "${expectedStatus}"`,
        path: ['execution', 'status'],
      });
    }
  });

export type WorkflowWebhookEventType = z.infer<
  typeof workflowWebhookEventTypeSchema
>;
export type WorkflowWebhookExecutionStatus = z.infer<
  typeof workflowWebhookExecutionStatusSchema
>;
export type WorkflowWebhookExecution = z.infer<
  typeof workflowWebhookExecutionSchema
>;
export type WorkflowWebhookPayload = z.infer<
  typeof workflowWebhookPayloadSchema
>;

export function createWorkflowWebhookEventId(input: {
  event: WorkflowWebhookEventType;
  executionId: string;
  status: WorkflowWebhookExecutionStatus;
  workflowId: string;
}): string {
  return createWebhookEventId([
    'workflow',
    input.event,
    input.workflowId,
    input.executionId,
    input.status,
  ]);
}

export function classifyWorkflowWebhookError(
  message: string,
): WebhookErrorClass {
  return classifyWebhookError(message);
}

export function redactWorkflowWebhookText(value: string): string {
  return redactWebhookText(value);
}

export function createSampleWorkflowWebhookPayload(
  input: {
    event?: WorkflowWebhookEventType;
    executionId?: string;
    occurredAt?: Date | string;
    workflowId?: string;
  } = {},
): WorkflowWebhookPayload {
  const event = input.event ?? 'workflow.execution.completed';
  const executionId = input.executionId ?? 'execution_sample';
  const workflowId = input.workflowId ?? 'workflow_sample';
  const occurredAt =
    input.occurredAt instanceof Date
      ? input.occurredAt.toISOString()
      : (input.occurredAt ?? '2026-01-01T00:00:00.000Z');
  const isFailureEvent = event === 'workflow.execution.failed';
  const status = isFailureEvent
    ? WorkflowExecutionStatus.FAILED
    : WorkflowExecutionStatus.COMPLETED;

  return workflowWebhookPayloadSchema.parse({
    event,
    eventId: createWorkflowWebhookEventId({
      event,
      executionId,
      status,
      workflowId,
    }),
    execution: {
      completedAt: occurredAt,
      creditsUsed: 12,
      durationMs: 4200,
      error: isFailureEvent
        ? {
            class: 'validation',
            code: 'sample_node_error',
            message: 'Sample node produced invalid output',
            retryable: false,
          }
        : null,
      failedNodeId: isFailureEvent ? 'node_sample' : null,
      id: executionId,
      progress: isFailureEvent ? 40 : 100,
      startedAt: occurredAt,
      status,
      trigger: WorkflowExecutionTrigger.MANUAL,
      workflowId,
    },
    occurredAt,
    schemaVersion: WORKFLOW_WEBHOOK_SCHEMA_VERSION,
    timestamp: occurredAt,
  });
}
