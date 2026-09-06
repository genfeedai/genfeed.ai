import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WorkflowLifecycle } from '@genfeedai/workflows/contracts';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type * as CompatibilityApi from './workflow-api';
import type * as WorkflowApiContract from './workflow-api.types';

/**
 * Public workflow API request/response contracts. Adding, renaming, or
 * removing an export must update this fixture — the source scan below fails
 * until that happens.
 *
 * Runtime service values (`WorkflowApiService`, `createWorkflowApiService`,
 * `isCanonicalSystemWorkflow`) live on `workflow-api.ts` and are not type
 * contracts, so they stay out of this list.
 */
const PUBLIC_WORKFLOW_API_CONTRACTS = [
  'ApprovalResponse',
  'BatchExecution',
  'BatchExecutionItem',
  'BatchExecutionSummary',
  'BrandSummary',
  'CloudWorkflowData',
  'CreateWorkflowInput',
  'ExecuteOptions',
  'ExecutionEtaMetadata',
  'ExecutionNodeResult',
  'ExecutionResult',
  'ListExecutionsParams',
  'ResumeExecutionResult',
  'SystemWorkflowCatalogEntry',
  'UpdateWorkflowInput',
  'WebhookInfo',
  'WebhookSecretResponse',
  'WorkflowActionContext',
  'WorkflowInputVariable',
  'WorkflowMetadata',
  'WorkflowScheduleInput',
  'WorkflowSummary',
  'WorkflowTemplate',
] as const;

/**
 * File-local helpers used by public contracts. They are intentionally not
 * re-exported; keep them unexported and listed here.
 */
const INTERNAL_WORKFLOW_API_TYPES = [
  'BatchOutputSummary',
  'ExecutionMetadata',
] as const;

const PUBLIC_WORKFLOW_API_CONTRACT_KEYS: Record<
  (typeof PUBLIC_WORKFLOW_API_CONTRACTS)[number],
  readonly string[]
> = {
  ApprovalResponse: [
    'approvedAt',
    'approvedBy',
    'executionId',
    'nodeId',
    'rejectionReason',
    'status',
  ],
  BatchExecutionItem: [
    'completedAt',
    'error',
    'executionId',
    'id',
    'ingredientId',
    'outputCategory',
    'outputIngredientId',
    'outputSummary',
    'startedAt',
    'status',
  ],
  BatchExecution: [
    'completedCount',
    'createdAt',
    'failedCount',
    'id',
    'items',
    'status',
    'totalCount',
    'updatedAt',
    'workflowId',
  ],
  BatchExecutionSummary: [
    'completedCount',
    'createdAt',
    'failedCount',
    'id',
    'status',
    'totalCount',
    'workflowId',
  ],
  BrandSummary: ['id', 'label', 'logoUrl', 'primaryColor', 'slug'],
  CloudWorkflowData: [
    'brandId',
    'createdAt',
    'createdBy',
    'description',
    'edgeStyle',
    'edges',
    'groups',
    'id',
    'inputVariables',
    'isScheduleEnabled',
    'label',
    'lifecycle',
    'metadata',
    'nextRunAt',
    'nodes',
    'organizationId',
    'schedule',
    'thumbnail',
    'thumbnailNodeId',
    'timezone',
    'updatedAt',
  ],
  CreateWorkflowInput: [
    'brandId',
    'description',
    'edgeStyle',
    'edges',
    'groups',
    'inputVariables',
    'isScheduleEnabled',
    'label',
    'metadata',
    'nodes',
    'schedule',
    'sourceType',
    'sourceWorkflowId',
    'templateId',
    'timezone',
    'trigger',
  ],
  ExecuteOptions: [
    'expectedContextVersion',
    'inputValues',
    'metadata',
    'threadId',
  ],
  ExecutionEtaMetadata: [
    'actualDurationMs',
    'criticalPathNodeIds',
    'currentPhase',
    'estimatedDurationMs',
    'etaConfidence',
    'lastEtaUpdateAt',
    'remainingDurationMs',
    'startedAt',
  ],
  ExecutionNodeResult: [
    'completedAt',
    'creditsUsed',
    'error',
    'input',
    'nodeId',
    'nodeType',
    'output',
    'progress',
    'retryCount',
    'startedAt',
    'status',
  ],
  ExecutionResult: [
    'accounting',
    'completedAt',
    'createdAt',
    'creditsUsed',
    'durationMs',
    'error',
    'failedNodeId',
    'id',
    'inputValues',
    'metadata',
    'nodeResults',
    'progress',
    'startedAt',
    'status',
    'trigger',
    'updatedAt',
    'workflow',
    'workflowId',
  ],
  ListExecutionsParams: [
    'brandId',
    'limit',
    'offset',
    'status',
    'trigger',
    'workflowId',
  ],
  ResumeExecutionResult: ['message', 'runId', 'status'],
  SystemWorkflowCatalogEntry: [
    'canonicalId',
    'category',
    'changeSummary',
    'description',
    'family',
    'icon',
    'installable',
    'installed',
    'installedWorkflowId',
    'isScheduleEnabled',
    'label',
    'schedule',
    'sourceIssue',
    'version',
  ],
  UpdateWorkflowInput: [
    'brandId',
    'description',
    'edgeStyle',
    'edges',
    'groups',
    'inputVariables',
    'isScheduleEnabled',
    'label',
    'metadata',
    'nodes',
    'schedule',
    'thumbnail',
    'thumbnailNodeId',
    'timezone',
  ],
  WebhookInfo: [
    'authType',
    'lastTriggeredAt',
    'triggerCount',
    'webhookId',
    'webhookSecret',
    'webhookUrl',
  ],
  WebhookSecretResponse: ['webhookSecret'],
  WorkflowActionContext: ['expectedContextVersion', 'threadId'],
  WorkflowInputVariable: [
    'defaultValue',
    'description',
    'key',
    'label',
    'required',
    'type',
    'validation',
  ],
  WorkflowMetadata: ['duplicatedFromSystemWorkflow', 'systemWorkflow'],
  WorkflowScheduleInput: ['isScheduleEnabled', 'schedule', 'timezone'],
  WorkflowSummary: [
    'brandId',
    'cloudSync',
    'createdAt',
    'description',
    'id',
    'isScheduleEnabled',
    'label',
    'lifecycle',
    'metadata',
    'nextRunAt',
    'nodeCount',
    'schedule',
    'thumbnail',
    'thumbnailNodeId',
    'timezone',
    'updatedAt',
  ],
  WorkflowTemplate: [
    'category',
    'changeSummary',
    'description',
    'edges',
    'icon',
    'id',
    'inputVariables',
    'isScheduleEnabled',
    'name',
    'nodes',
    'routine',
    'schedule',
    'timezone',
    'version',
  ],
};

const CONTRACT_OWNER_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'workflow-api.types.ts',
);

function readContractOwnerSource(): string {
  return readFileSync(CONTRACT_OWNER_PATH, 'utf8');
}

function listTypeNames(source: string, exported: boolean): string[] {
  const pattern = exported
    ? /^export (?:interface|type) (\w+)/gm
    : /^(?:interface|type) (\w+)/gm;
  return [...source.matchAll(pattern)]
    .map((match) => match[1])
    .filter((name): name is string => Boolean(name))
    .toSorted();
}

function listTopLevelKeys(source: string, typeName: string): string[] {
  const header = source.match(
    new RegExp(`^export (?:interface|type) ${typeName}\\b[^{]*\\{`, 'm'),
  );
  if (!header || header.index === undefined) {
    return [];
  }

  const bodyStart = header.index + header[0].length;
  let depth = 1;
  let index = bodyStart;
  while (index < source.length && depth > 0) {
    const character = source[index];
    if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
    }
    index += 1;
  }

  const body = source.slice(bodyStart, index - 1);
  return [...body.matchAll(/^ {2}(\w+)\??:/gm)]
    .map((match) => match[1])
    .filter((name): name is string => Boolean(name))
    .toSorted();
}

describe('workflow API contract exports', () => {
  it('imports WorkflowLifecycle from the workflows contract package', () => {
    const source = readContractOwnerSource();

    expect(source).toMatch(
      /import type \{[^}]*WorkflowLifecycle[^}]*\} from '@genfeedai\/workflows\/contracts'/,
    );
    expect(source).not.toMatch(
      /WorkflowLifecycle[^}]*\} from '@genfeedai\/enums'/,
    );
  });

  it('pins every intended public contract export', () => {
    const source = readContractOwnerSource();

    expect(listTypeNames(source, true)).toEqual([
      ...PUBLIC_WORKFLOW_API_CONTRACTS,
    ]);
  });

  it('documents internal types excluded from the public contract', () => {
    const source = readContractOwnerSource();

    expect(listTypeNames(source, false)).toEqual([
      ...INTERNAL_WORKFLOW_API_TYPES,
    ]);
  });

  it('fails when a public contract shape changes', () => {
    const source = readContractOwnerSource();
    const actualKeys = Object.fromEntries(
      PUBLIC_WORKFLOW_API_CONTRACTS.map((typeName) => [
        typeName,
        listTopLevelKeys(source, typeName),
      ]),
    );

    expect(actualKeys).toEqual(PUBLIC_WORKFLOW_API_CONTRACT_KEYS);
  });

  it('preserves every public contract through the compatibility module', () => {
    expectTypeOf<CompatibilityApi.ApprovalResponse>().toEqualTypeOf<WorkflowApiContract.ApprovalResponse>();
    expectTypeOf<CompatibilityApi.BatchExecution>().toEqualTypeOf<WorkflowApiContract.BatchExecution>();
    expectTypeOf<CompatibilityApi.BatchExecutionItem>().toEqualTypeOf<WorkflowApiContract.BatchExecutionItem>();
    expectTypeOf<CompatibilityApi.BatchExecutionSummary>().toEqualTypeOf<WorkflowApiContract.BatchExecutionSummary>();
    expectTypeOf<CompatibilityApi.BrandSummary>().toEqualTypeOf<WorkflowApiContract.BrandSummary>();
    expectTypeOf<CompatibilityApi.CloudWorkflowData>().toEqualTypeOf<WorkflowApiContract.CloudWorkflowData>();
    expectTypeOf<CompatibilityApi.CreateWorkflowInput>().toEqualTypeOf<WorkflowApiContract.CreateWorkflowInput>();
    expectTypeOf<CompatibilityApi.ExecuteOptions>().toEqualTypeOf<WorkflowApiContract.ExecuteOptions>();
    expectTypeOf<CompatibilityApi.ExecutionEtaMetadata>().toEqualTypeOf<WorkflowApiContract.ExecutionEtaMetadata>();
    expectTypeOf<CompatibilityApi.ExecutionNodeResult>().toEqualTypeOf<WorkflowApiContract.ExecutionNodeResult>();
    expectTypeOf<CompatibilityApi.ExecutionResult>().toEqualTypeOf<WorkflowApiContract.ExecutionResult>();
    expectTypeOf<CompatibilityApi.ListExecutionsParams>().toEqualTypeOf<WorkflowApiContract.ListExecutionsParams>();
    expectTypeOf<CompatibilityApi.ResumeExecutionResult>().toEqualTypeOf<WorkflowApiContract.ResumeExecutionResult>();
    expectTypeOf<CompatibilityApi.SystemWorkflowCatalogEntry>().toEqualTypeOf<WorkflowApiContract.SystemWorkflowCatalogEntry>();
    expectTypeOf<CompatibilityApi.UpdateWorkflowInput>().toEqualTypeOf<WorkflowApiContract.UpdateWorkflowInput>();
    expectTypeOf<CompatibilityApi.WebhookInfo>().toEqualTypeOf<WorkflowApiContract.WebhookInfo>();
    expectTypeOf<CompatibilityApi.WebhookSecretResponse>().toEqualTypeOf<WorkflowApiContract.WebhookSecretResponse>();
    expectTypeOf<CompatibilityApi.WorkflowActionContext>().toEqualTypeOf<WorkflowApiContract.WorkflowActionContext>();
    expectTypeOf<CompatibilityApi.WorkflowInputVariable>().toEqualTypeOf<WorkflowApiContract.WorkflowInputVariable>();
    expectTypeOf<CompatibilityApi.WorkflowMetadata>().toEqualTypeOf<WorkflowApiContract.WorkflowMetadata>();
    expectTypeOf<CompatibilityApi.WorkflowScheduleInput>().toEqualTypeOf<WorkflowApiContract.WorkflowScheduleInput>();
    expectTypeOf<CompatibilityApi.WorkflowSummary>().toEqualTypeOf<WorkflowApiContract.WorkflowSummary>();
    expectTypeOf<CompatibilityApi.WorkflowTemplate>().toEqualTypeOf<WorkflowApiContract.WorkflowTemplate>();
  });

  it('uses the workflows contract for lifecycle fields', () => {
    expectTypeOf<
      WorkflowApiContract.CloudWorkflowData['lifecycle']
    >().toEqualTypeOf<WorkflowLifecycle>();
    expectTypeOf<
      WorkflowApiContract.WorkflowSummary['lifecycle']
    >().toEqualTypeOf<WorkflowLifecycle>();
  });
});
