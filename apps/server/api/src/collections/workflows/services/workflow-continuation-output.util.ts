import { getActionDefinition } from '@genfeedai/actions';
import { IngredientStatus } from '@genfeedai/contracts';
import { Prisma, WorkflowNodeContinuationStatus } from '@genfeedai/prisma';
import {
  type ActionContractJsonSchema,
  compileActionContract,
} from '@genfeedai/workflows/engine';

const MEDIA_CALLBACK_ACTION_IDS = new Set([
  'aiAvatarVideo',
  'imageGen',
  'lipSync',
  'reframe',
  'upscale',
  'videoGen',
]);

export type ContinuationRow = {
  actionId: string;
  completedAt: Date | null;
  creditsUsed: number;
  error: string | null;
  executionId: string;
  externalId: string | null;
  id: string;
  ingredientId: string;
  initialOutput: unknown;
  nodeId: string;
  organizationId: string;
  provider: string;
  providerResult: unknown;
  pollAttempt: number | null;
  pollDispatchClaimedAt: Date | null;
  pollDispatchedAt: Date | null;
  resumeClaimedAt: Date | null;
  status: WorkflowNodeContinuationStatus;
  updatedAt: Date;
  workflowVersionId: string;
};

export type ProviderContinuationIdentity =
  | { continuationId: string; organizationId: string }
  | { ingredientId: string; organizationId: string }
  | { externalId: string; organizationId: string };

export type ContinuationSettlement =
  | { kind: 'duplicate' | 'pending-output' }
  | {
      actionId: string;
      continuationId: string;
      creditsUsed: number;
      error?: string;
      executionId: string;
      finalOutput?: unknown;
      ingredientId: string;
      kind: 'claimed';
      nodeId: string;
      organizationId: string;
      workflowVersionId: string;
    };

export type AttachedContinuationOutput =
  | { kind: 'waiting' }
  /** A provider failure was claimed before the output arrived; its claimant drives the node. */
  | { kind: 'settled-elsewhere' }
  | {
      continuationId: string;
      error?: string;
      finalOutput?: unknown;
      kind: 'provider-settled';
      succeeded: boolean;
    };

export type InitialOutputAttachPlan =
  | { kind: 'settled-elsewhere' }
  | {
      kind: 'write';
      result: AttachedContinuationOutput;
      status: WorkflowNodeContinuationStatus;
    };

export type ProviderSubmission = {
  completionQuantities?: {
    duration?: number;
    height?: number;
    width?: number;
  };
  externalId: string;
};

export type ContinuationReconciliationCandidate = {
  continuationId: string;
  error?: string;
  organizationId: string;
  provider: string;
  providerResult?: Record<string, unknown>;
  succeeded: boolean;
};

export function assertProviderCallbackAction(actionId: string): void {
  const action = getActionDefinition(actionId);
  if (action?.completionMode !== 'provider-callback') {
    throw new Error(
      `Action ${actionId} does not declare provider-callback completion`,
    );
  }
}

export function validateActionOutput(actionId: string, output: unknown): void {
  const action = getActionDefinition(actionId);
  if (!action) {
    throw new Error(`Unknown Genfeed action ${actionId}`);
  }
  compileActionContract(actionId, {
    inputSchema: action.inputSchema as ActionContractJsonSchema,
    outputSchema: action.outputSchema as ActionContractJsonSchema,
  }).validateOutput(output, {
    nodeId: 'provider-callback',
    runId: 'provider-callback',
    workflowId: 'provider-callback',
    workflowVersionId: 'provider-callback',
  });
}

export function buildFinalOutput(actionId: string, output: unknown): unknown {
  if (actionId === 'workspace.task.facecam.generate') {
    return output;
  }
  if (!MEDIA_CALLBACK_ACTION_IDS.has(actionId)) {
    throw new Error(
      `Provider-callback action ${actionId} has no exact continuation finalizer`,
    );
  }
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    throw new Error(
      `Provider-callback action ${actionId} returned a non-object media result`,
    );
  }
  return {
    ...(output as Record<string, unknown>),
    status: IngredientStatus.GENERATED,
  };
}

export function buildFailedOutput(actionId: string, output: unknown): unknown {
  if (actionId === 'workspace.task.facecam.generate') {
    return undefined;
  }
  if (!MEDIA_CALLBACK_ACTION_IDS.has(actionId)) {
    throw new Error(
      `Provider-callback action ${actionId} has no exact continuation finalizer`,
    );
  }
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    throw new Error(
      `Provider-callback action ${actionId} returned a non-object media result`,
    );
  }
  return {
    ...(output as Record<string, unknown>),
    status: IngredientStatus.FAILED,
  };
}

export function buildIdentityWhere(
  provider: string,
  identity: ProviderContinuationIdentity,
): Record<string, unknown> {
  const organizationId = identity.organizationId;
  if ('continuationId' in identity) {
    return {
      id: identity.continuationId,
      provider,
      organizationId,
    };
  }
  if ('ingredientId' in identity) {
    return {
      ingredientId: identity.ingredientId,
      provider,
      organizationId,
    };
  }
  return {
    externalId: identity.externalId,
    organizationId,
    provider,
  };
}

export function assertSameIdentity(
  existing: ContinuationRow,
  expected: {
    actionId: string;
    ingredientId: string;
    organizationId: string;
    provider: string;
    workflowVersionId: string;
  },
): void {
  if (
    existing.actionId !== expected.actionId ||
    existing.ingredientId !== expected.ingredientId ||
    existing.organizationId !== expected.organizationId ||
    existing.provider !== expected.provider ||
    existing.workflowVersionId !== expected.workflowVersionId
  ) {
    throw new Error(
      `Workflow continuation ${existing.id} identity does not match its immutable execution node`,
    );
  }
}

/**
 * What attaching the node's initial output does to the continuation, by its
 * current status (#9734). Before the provider answers the node waits; once it
 * answered, the attaching process takes the resume lease. A continuation that
 * is already resuming or finished belongs to whoever claimed it.
 */
export function planInitialOutputAttach(
  continuation: ContinuationRow,
  initialOutput: unknown,
): InitialOutputAttachPlan {
  switch (continuation.status) {
    case WorkflowNodeContinuationStatus.PENDING_SUBMISSION:
    case WorkflowNodeContinuationStatus.WAITING_PROVIDER:
      return {
        kind: 'write',
        result: { kind: 'waiting' },
        status: WorkflowNodeContinuationStatus.WAITING_PROVIDER,
      };
    case WorkflowNodeContinuationStatus.PROVIDER_SUCCEEDED: {
      const finalOutput = buildFinalOutput(
        continuation.actionId,
        initialOutput,
      );
      if (finalOutput !== undefined) {
        validateActionOutput(continuation.actionId, finalOutput);
      }
      return {
        kind: 'write',
        result: {
          continuationId: continuation.id,
          ...(finalOutput === undefined ? {} : { finalOutput }),
          kind: 'provider-settled',
          succeeded: true,
        },
        status: WorkflowNodeContinuationStatus.RESUMING,
      };
    }
    case WorkflowNodeContinuationStatus.PROVIDER_FAILED: {
      const finalOutput = buildFailedOutput(
        continuation.actionId,
        initialOutput,
      );
      if (finalOutput !== undefined) {
        validateActionOutput(continuation.actionId, finalOutput);
      }
      return {
        kind: 'write',
        result: {
          continuationId: continuation.id,
          ...(continuation.error ? { error: continuation.error } : {}),
          ...(finalOutput === undefined ? {} : { finalOutput }),
          kind: 'provider-settled',
          succeeded: false,
        },
        status: WorkflowNodeContinuationStatus.RESUMING,
      };
    }
    case WorkflowNodeContinuationStatus.RESUMING:
    case WorkflowNodeContinuationStatus.COMPLETED:
    case WorkflowNodeContinuationStatus.FAILED:
      return { kind: 'settled-elsewhere' };
  }
}

function readJsonObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * The write that records the provider accepting a submission. Throws when the
 * provider identity, or an accepted Fal output, changed. Only a
 * PENDING_SUBMISSION continuation moves to WAITING_PROVIDER; a callback that
 * already answered keeps its status.
 */
export function buildProviderSubmittedUpdate(
  continuation: ContinuationRow,
  submission: ProviderSubmission,
  requiresPoll: boolean,
): Prisma.WorkflowNodeContinuationUpdateManyMutationInput {
  if (
    continuation.externalId &&
    continuation.externalId !== submission.externalId
  ) {
    throw new Error(
      `Workflow continuation ${continuation.id} provider identity changed`,
    );
  }

  const previousResult = readJsonObject(continuation.providerResult);
  const previousAccepted = readJsonObject(previousResult.acceptedFalOutput);
  const previousQuantities = readJsonObject(
    previousAccepted.completionQuantities,
  );
  if (
    continuation.provider === 'fal' &&
    previousResult.acceptedFalOutput !== undefined
  ) {
    if (previousAccepted.externalId !== submission.externalId)
      throw new Error('Fal accepted output identity changed');
    for (const key of ['width', 'height', 'duration'] as const) {
      if (
        submission.completionQuantities?.[key] !== undefined &&
        previousQuantities[key] !== submission.completionQuantities[key]
      )
        throw new Error(`Fal accepted ${key} changed`);
    }
  }

  return {
    externalId: submission.externalId,
    ...(continuation.provider === 'fal'
      ? {
          providerResult: {
            ...previousResult,
            acceptedFalOutput: previousResult.acceptedFalOutput ?? {
              externalId: submission.externalId,
              ...(submission.completionQuantities
                ? { completionQuantities: submission.completionQuantities }
                : {}),
            },
          } as Prisma.InputJsonValue,
        }
      : {}),
    ...(continuation.provider === 'heygen' && requiresPoll
      ? {
          pollAttempt: continuation.pollAttempt ?? 1,
          pollDispatchClaimedAt: null,
          pollDispatchedAt: null,
        }
      : {}),
    ...(continuation.status ===
    WorkflowNodeContinuationStatus.PENDING_SUBMISSION
      ? { status: WorkflowNodeContinuationStatus.WAITING_PROVIDER }
      : {}),
  };
}
