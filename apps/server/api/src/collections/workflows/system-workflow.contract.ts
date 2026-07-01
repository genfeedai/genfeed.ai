export const SYSTEM_WORKFLOW_METADATA_KEY = 'systemWorkflow';
export const SYSTEM_WORKFLOW_DUPLICATE_METADATA_KEY =
  'duplicatedFromSystemWorkflow';
export const SYSTEM_WORKFLOW_OWNER = 'genfeed';
export const SYSTEM_WORKFLOW_PRODUCTIZATION_ISSUE = 1011;

export type SystemWorkflowCredentialPolicy =
  | 'tenant-connected-account'
  | 'system-policy';

export type SystemWorkflowMetadata = {
  canonicalId: string;
  credentialPolicy: SystemWorkflowCredentialPolicy;
  duplicable: boolean;
  immutable: boolean;
  kind: 'system-workflow';
  owner: typeof SYSTEM_WORKFLOW_OWNER;
  productizationIssue: typeof SYSTEM_WORKFLOW_PRODUCTIZATION_ISSUE;
  sourceIssue?: number;
  visibility: 'organization';
};

export type BuildSystemWorkflowMetadataInput = {
  canonicalId: string;
  credentialPolicy?: SystemWorkflowCredentialPolicy;
  sourceIssue?: number;
};

export function buildSystemWorkflowMetadata(
  input: BuildSystemWorkflowMetadataInput,
): SystemWorkflowMetadata {
  return {
    canonicalId: input.canonicalId,
    credentialPolicy: input.credentialPolicy ?? 'tenant-connected-account',
    duplicable: true,
    immutable: true,
    kind: 'system-workflow',
    owner: SYSTEM_WORKFLOW_OWNER,
    productizationIssue: SYSTEM_WORKFLOW_PRODUCTIZATION_ISSUE,
    sourceIssue: input.sourceIssue,
    visibility: 'organization',
  };
}

export function getMetadataRecord(metadata: unknown): Record<string, unknown> {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return { ...(metadata as Record<string, unknown>) };
  }

  return {};
}

export function getSystemWorkflowMetadata(
  metadata: unknown,
): SystemWorkflowMetadata | null {
  const systemWorkflow =
    getMetadataRecord(metadata)[SYSTEM_WORKFLOW_METADATA_KEY];

  if (
    !systemWorkflow ||
    typeof systemWorkflow !== 'object' ||
    Array.isArray(systemWorkflow)
  ) {
    return null;
  }

  const record = systemWorkflow as Record<string, unknown>;
  if (
    record.kind !== 'system-workflow' ||
    record.owner !== SYSTEM_WORKFLOW_OWNER ||
    typeof record.canonicalId !== 'string'
  ) {
    return null;
  }

  return record as SystemWorkflowMetadata;
}

export function isProtectedSystemWorkflowMetadata(metadata: unknown): boolean {
  const systemWorkflow = getSystemWorkflowMetadata(metadata);
  return systemWorkflow?.immutable === true;
}

export function buildSystemWorkflowDuplicateMetadata(
  metadata: unknown,
  sourceWorkflowId: string,
): Record<string, unknown> {
  const duplicatedMetadata = getMetadataRecord(metadata);
  const systemWorkflow = getSystemWorkflowMetadata(duplicatedMetadata);
  delete duplicatedMetadata[SYSTEM_WORKFLOW_METADATA_KEY];

  if (!systemWorkflow) {
    return duplicatedMetadata;
  }

  return {
    ...duplicatedMetadata,
    [SYSTEM_WORKFLOW_DUPLICATE_METADATA_KEY]: {
      canonicalId: systemWorkflow.canonicalId,
      credentialPolicy: systemWorkflow.credentialPolicy,
      duplicatedAt: new Date().toISOString(),
      productizationIssue: systemWorkflow.productizationIssue,
      sourceIssue: systemWorkflow.sourceIssue,
      sourceWorkflowId,
    },
  };
}
