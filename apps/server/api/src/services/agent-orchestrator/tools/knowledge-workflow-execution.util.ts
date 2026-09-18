import {
  KNOWLEDGE_WORKFLOW_MUTATION_ACTION_IDS,
  KNOWLEDGE_WORKFLOW_READ_ACTION_IDS,
} from '@genfeedai/actions';
import type {
  AgentToolResult,
  KnowledgeWorkflowProvenance,
} from '@genfeedai/contracts/interfaces';
import type { ExecutionContext } from '@genfeedai/workflows/engine';

const KNOWLEDGE_WORKFLOW_ACTION_IDS = new Set<string>([
  ...KNOWLEDGE_WORKFLOW_READ_ACTION_IDS,
  ...KNOWLEDGE_WORKFLOW_MUTATION_ACTION_IDS,
]);

const SCOPE_PARAMETER_KEYS = ['organizationId', 'userId', 'brandId'] as const;

export function isKnowledgeWorkflowAction(toolName: string): boolean {
  return KNOWLEDGE_WORKFLOW_ACTION_IDS.has(toolName);
}

export function isKnowledgeWorkflowMutationAction(toolName: string): boolean {
  return (KNOWLEDGE_WORKFLOW_MUTATION_ACTION_IDS as readonly string[]).includes(
    toolName,
  );
}

export function shouldUseKnowledgeWorkflowEntry(input: {
  isCustomerWorkflow?: boolean;
  hasAgentRuntimeContext: boolean;
}): boolean {
  return input.isCustomerWorkflow === true || !input.hasAgentRuntimeContext;
}

export function assertKnowledgeWorkflowIdentity(
  context: ExecutionContext,
): void {
  if (
    !context.organizationId ||
    !context.userId ||
    !context.brandId ||
    !context.workflowVersionId
  ) {
    throw new Error(
      'Knowledge workflow nodes require organization, user, brand, and workflow version identity',
    );
  }
}

export function assertKnowledgeWorkflowScopeParameters(
  input: Record<string, unknown>,
  context: ExecutionContext,
): void {
  for (const key of SCOPE_PARAMETER_KEYS) {
    const value = input[key];
    if (value === undefined) {
      continue;
    }
    const expected =
      key === 'organizationId'
        ? context.organizationId
        : key === 'userId'
          ? context.userId
          : context.brandId;
    if (typeof value !== 'string' || value !== expected) {
      throw new Error('Knowledge source was not found');
    }
  }
}

export function toWorkflowToolExecutionContext(context: ExecutionContext): {
  brandId: string;
  hostSupportsApproval: true;
  isWorkflowScoped: true;
  organizationId: string;
  runId: string;
  scheduledFireJobId?: string;
  userId: string;
} {
  const brandId = context.brandId;
  if (
    !context.organizationId ||
    !context.userId ||
    !brandId ||
    !context.workflowVersionId
  ) {
    throw new Error(
      'Knowledge workflow nodes require organization, user, brand, and workflow version identity',
    );
  }
  return {
    brandId,
    hostSupportsApproval: true,
    isWorkflowScoped: true,
    organizationId: context.organizationId,
    runId: context.executionId ?? context.runId,
    ...(context.scheduledFireJobId
      ? { scheduledFireJobId: context.scheduledFireJobId }
      : {}),
    userId: context.userId,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readSourceRef(
  value: unknown,
): { sourceId: string; sourceVersionId: string | null } | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const sourceId =
    typeof value.sourceId === 'string'
      ? value.sourceId
      : typeof value.id === 'string'
        ? value.id
        : undefined;
  if (!sourceId) {
    return undefined;
  }
  const versionId =
    typeof value.sourceVersionId === 'string'
      ? value.sourceVersionId
      : typeof value.versionId === 'string'
        ? value.versionId
        : null;
  return { sourceId, sourceVersionId: versionId };
}

function collectSourceRefs(data: Record<string, unknown>): {
  sourceId: string;
  sourceVersionId: string | null;
}[] {
  const refs: { sourceId: string; sourceVersionId: string | null }[] = [];
  const seen = new Set<string>();

  const add = (value: unknown) => {
    const ref = readSourceRef(value);
    if (!ref) {
      return;
    }
    const key = `${ref.sourceId}:${ref.sourceVersionId ?? ''}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    refs.push(ref);
  };

  if (Array.isArray(data.passages)) {
    for (const passage of data.passages) {
      if (isRecord(passage)) {
        add(passage.citation);
      }
    }
  }
  if (Array.isArray(data.sources)) {
    for (const source of data.sources) {
      add(source);
    }
  }
  add(data);

  return refs;
}

export function attachKnowledgeWorkflowProvenance(
  result: AgentToolResult,
  context: ExecutionContext,
  nodeId: string,
): AgentToolResult {
  const data = isRecord(result.data) ? { ...result.data } : {};
  const provenance: KnowledgeWorkflowProvenance = {
    nodeId,
    runId: context.executionId ?? context.runId,
    sources: collectSourceRefs(data),
    workflowVersionId: context.workflowVersionId,
  };
  return {
    ...result,
    data: {
      ...data,
      workflowProvenance: provenance,
    },
  };
}

export function assertKnowledgeWorkflowSuccess(
  result: AgentToolResult,
  toolName: string,
): AgentToolResult {
  if (result.success) {
    return result;
  }
  throw new Error(result.error ?? `Knowledge action ${toolName} failed`);
}
