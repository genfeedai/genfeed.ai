import { getActionDefinition } from '@genfeedai/actions';
import { IngredientStatus } from '@genfeedai/contracts';
import { WorkflowNodeContinuationStatus } from '@genfeedai/prisma';
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
  | {
      continuationId: string;
      error?: string;
      finalOutput?: unknown;
      kind: 'provider-settled';
      succeeded: boolean;
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
