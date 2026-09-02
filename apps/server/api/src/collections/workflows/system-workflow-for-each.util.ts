import { createHash } from 'node:crypto';
import type {
  SystemWorkflowActionRequest,
  SystemWorkflowProvenance,
} from '@api/collections/workflows/system-workflow-runner.service';
import { WorkflowExecutionTrigger } from '@genfeedai/enums';

export const WORKFLOW_FOR_EACH_ACTION_ID = 'workflow.for-each';

const MAX_FOR_EACH_CONCURRENCY = 10;
const MAX_FOR_EACH_ITEMS = 500;
const MAX_FOR_EACH_DELAY_MS = 7 * 24 * 60 * 60 * 1000;

export type ForEachChildContext = {
  organizationId: string;
  userId: string;
};

export type ForEachOptions = {
  baseInput: Record<string, unknown>;
  childWorkflowId: string;
  childWorkflowVersionId?: string;
  failureMode: 'collect' | 'fail-fast';
  initialDelayMs: number;
  interItemDelayMs: number;
  itemInputKey: string;
  items: unknown[];
  maxConcurrency: number;
  mode: 'await' | 'scheduled';
};

type AwaitedForEachResult =
  | {
      index: number;
      provenance: SystemWorkflowProvenance;
      result: unknown;
    }
  | {
      error: string;
      executionId?: string;
      index: number;
      status: 'failed';
    };

export function parseForEachOptions(
  input: Record<string, unknown>,
): ForEachOptions {
  const childWorkflowId = requiredString(
    input.childWorkflowId,
    'childWorkflowId',
  );
  const itemInputKey = optionalString(input.itemInputKey) ?? 'item';
  const childWorkflowVersionId = optionalString(input.childWorkflowVersionId);
  const items = input.items;
  if (!Array.isArray(items)) {
    throw new Error('workflow.for-each requires an items array');
  }
  if (items.length > MAX_FOR_EACH_ITEMS) {
    throw new Error(
      `workflow.for-each accepts at most ${MAX_FOR_EACH_ITEMS} items`,
    );
  }

  const mode = optionalString(input.mode) ?? 'await';
  if (mode !== 'await' && mode !== 'scheduled') {
    throw new Error('workflow.for-each mode must be await or scheduled');
  }
  if (childWorkflowVersionId && mode === 'scheduled') {
    throw new Error(
      'workflow.for-each pinned tenant workflows require await mode',
    );
  }
  const failureMode = optionalString(input.failureMode) ?? 'fail-fast';
  if (failureMode !== 'fail-fast' && failureMode !== 'collect') {
    throw new Error(
      'workflow.for-each failureMode must be fail-fast or collect',
    );
  }

  const interItemDelayMs = boundedOptionalInteger(
    input.interItemDelayMs,
    'interItemDelayMs',
    0,
    MAX_FOR_EACH_DELAY_MS,
  );
  const initialDelayMs = boundedOptionalInteger(
    input.initialDelayMs,
    'initialDelayMs',
    0,
    MAX_FOR_EACH_DELAY_MS,
  );
  if (mode === 'await' && interItemDelayMs !== 0) {
    throw new Error(
      'workflow.for-each interItemDelayMs requires scheduled mode',
    );
  }
  if (mode === 'await' && initialDelayMs !== 0) {
    throw new Error('workflow.for-each initialDelayMs requires scheduled mode');
  }
  const finalDelayMs =
    initialDelayMs + Math.max(items.length - 1, 0) * interItemDelayMs;
  if (finalDelayMs > MAX_FOR_EACH_DELAY_MS) {
    throw new Error(
      `workflow.for-each final scheduled delay may not exceed ${MAX_FOR_EACH_DELAY_MS}ms`,
    );
  }

  const maxConcurrency =
    input.maxConcurrency === undefined
      ? 1
      : boundedInteger(
          input.maxConcurrency,
          'maxConcurrency',
          1,
          MAX_FOR_EACH_CONCURRENCY,
        );
  return {
    baseInput: readRecord(input.baseInput),
    childWorkflowId,
    childWorkflowVersionId,
    failureMode,
    initialDelayMs,
    interItemDelayMs,
    itemInputKey,
    items,
    maxConcurrency,
    mode,
  };
}

export async function executeAwaitedForEach(input: {
  childContexts: ForEachChildContext[];
  failureMode: ForEachOptions['failureMode'];
  items: unknown[];
  maxConcurrency: number;
  executeItem: (
    index: number,
    childContext: ForEachChildContext,
  ) => Promise<{ provenance: SystemWorkflowProvenance; result: unknown }>;
}): Promise<{ count: number; results: AwaitedForEachResult[] }> {
  const results: AwaitedForEachResult[] = new Array(input.items.length);
  let cursor = 0;
  let failure: unknown;

  const worker = async (): Promise<void> => {
    while (failure === undefined) {
      const index = cursor;
      cursor += 1;
      if (index >= input.items.length) {
        return;
      }
      try {
        const childContext = input.childContexts[index];
        if (!childContext) {
          throw new Error(
            `workflow.for-each could not resolve child context for item ${index}`,
          );
        }
        const child = await input.executeItem(index, childContext);
        results[index] = { index, ...child };
      } catch (error: unknown) {
        if (input.failureMode === 'fail-fast') {
          failure = error;
          continue;
        }
        const executionId = optionalString(
          readRecord(error).workflowExecutionId,
        );
        results[index] = {
          error: error instanceof Error ? error.message : String(error),
          ...(executionId ? { executionId } : {}),
          index,
          status: 'failed',
        };
      }
    }
  };

  await Promise.all(
    Array.from(
      {
        length: Math.min(input.maxConcurrency, Math.max(input.items.length, 1)),
      },
      () => worker(),
    ),
  );
  if (failure !== undefined) {
    throw failure;
  }
  return { count: results.length, results };
}

export async function scheduleForEach(input: {
  childContexts: ForEachChildContext[];
  options: ForEachOptions;
  parentNodeId: string;
  queueSystemWorkflow: (
    workflow: {
      actionType: string;
      canonicalId: string;
      inputValues: Record<string, unknown>;
      metadata: Record<string, unknown>;
      organizationId: string;
      source: string;
      trigger: WorkflowExecutionTrigger;
      userId: string;
    },
    jobId: string,
    options: { delayMs: number; replaceTerminalJob: boolean },
  ) => Promise<string>;
  request: SystemWorkflowActionRequest;
}): Promise<{
  count: number;
  results: Array<{ index: number; jobId: string }>;
}> {
  const jobs: Array<{ index: number; jobId: string }> = [];
  for (const [index, item] of input.options.items.entries()) {
    const childContext = input.childContexts[index];
    if (!childContext) {
      throw new Error(
        `workflow.for-each could not resolve child context for item ${index}`,
      );
    }
    const identity = createHash('sha256')
      .update(
        `${input.request.provenance.executionId}:${input.parentNodeId}:${input.options.childWorkflowId}:${index}`,
      )
      .digest('hex')
      .slice(0, 32);
    const jobId = await input.queueSystemWorkflow(
      {
        actionType: input.options.childWorkflowId,
        canonicalId: input.options.childWorkflowId,
        inputValues: {
          ...input.options.baseInput,
          [input.options.itemInputKey]: item,
        },
        metadata: {
          parentExecutionId: input.request.provenance.executionId,
          parentNodeId: input.parentNodeId,
          parentWorkflowId: input.request.provenance.workflowId,
          workflowForEachIndex: index,
        },
        organizationId: childContext.organizationId,
        source: `${WORKFLOW_FOR_EACH_ACTION_ID}:${input.request.provenance.executionId}:${input.parentNodeId}`,
        trigger: WorkflowExecutionTrigger.SCHEDULED,
        userId: childContext.userId,
      },
      `${WORKFLOW_FOR_EACH_ACTION_ID}-${identity}`,
      {
        delayMs:
          input.options.initialDelayMs + index * input.options.interItemDelayMs,
        replaceTerminalJob: true,
      },
    );
    jobs.push({ index, jobId });
  }
  return { count: jobs.length, results: jobs };
}

export function buildForEachChildIdempotencyKey(input: {
  childWorkflowVersionId: string;
  index: number;
  parentExecutionId: string;
  parentNodeId: string;
}): string {
  const identity = createHash('sha256')
    .update(
      [
        input.parentExecutionId,
        input.parentNodeId,
        String(input.index),
        input.childWorkflowVersionId,
      ].join(':'),
    )
    .digest('hex');
  return `workflow-for-each:${identity}`;
}

function boundedOptionalInteger(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number {
  return value === undefined ? 0 : boundedInteger(value, field, min, max);
}

function boundedInteger(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new Error(`${field} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requiredString(value: unknown, field: string): string {
  const result = optionalString(value);
  if (!result) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return result;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}
