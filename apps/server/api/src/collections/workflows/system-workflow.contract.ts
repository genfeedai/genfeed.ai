export const SYSTEM_WORKFLOW_METADATA_KEY = 'systemWorkflow';
export const SYSTEM_WORKFLOW_DUPLICATE_METADATA_KEY =
  'duplicatedFromSystemWorkflow';
export const SYSTEM_WORKFLOW_OWNER = 'genfeed';
export const SYSTEM_WORKFLOW_PRODUCTIZATION_ISSUE = 1011;
export const SYSTEM_WORKFLOW_TEMPLATE_VERSION = 1;
export const SYSTEM_WORKFLOW_TEMPLATE_CHANGE_SUMMARY =
  'Initial system workflow template version.';

export type SystemWorkflowCredentialPolicy =
  | 'tenant-connected-account'
  | 'system-policy';

export type SystemWorkflowUpgradeStatus = 'current' | 'upgrade_available';

export type SystemWorkflowMetadata = {
  canonicalId: string;
  changeSummary: string;
  credentialPolicy: SystemWorkflowCredentialPolicy;
  duplicable: boolean;
  immutable: boolean;
  kind: 'system-workflow';
  owner: typeof SYSTEM_WORKFLOW_OWNER;
  productizationIssue: typeof SYSTEM_WORKFLOW_PRODUCTIZATION_ISSUE;
  sourceIssue?: number;
  version: number;
  visibility: 'organization';
};

export type SystemWorkflowDuplicateMetadata = {
  canonicalId: string;
  currentSystemWorkflowChangeSummary: string;
  currentSystemWorkflowVersion: number;
  credentialPolicy: SystemWorkflowCredentialPolicy;
  duplicatedAt: string;
  productizationIssue: typeof SYSTEM_WORKFLOW_PRODUCTIZATION_ISSUE;
  sourceIssue?: number;
  sourceWorkflowChangeSummary: string;
  sourceWorkflowId: string;
  sourceWorkflowVersion: number;
  upgradeEligible: boolean;
  upgradePolicy: 'manual';
  upgradeStatus: SystemWorkflowUpgradeStatus;
};

export type BuildSystemWorkflowMetadataInput = {
  canonicalId: string;
  changeSummary?: string;
  credentialPolicy?: SystemWorkflowCredentialPolicy;
  sourceIssue?: number;
  version?: number;
};

export function buildSystemWorkflowMetadata(
  input: BuildSystemWorkflowMetadataInput,
): SystemWorkflowMetadata {
  const version = normalizeSystemWorkflowVersion(input.version);

  return {
    canonicalId: input.canonicalId,
    changeSummary:
      input.changeSummary ?? SYSTEM_WORKFLOW_TEMPLATE_CHANGE_SUMMARY,
    credentialPolicy: input.credentialPolicy ?? 'tenant-connected-account',
    duplicable: true,
    immutable: true,
    kind: 'system-workflow',
    owner: SYSTEM_WORKFLOW_OWNER,
    productizationIssue: SYSTEM_WORKFLOW_PRODUCTIZATION_ISSUE,
    sourceIssue: input.sourceIssue,
    version,
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

export function getSystemWorkflowDuplicateMetadata(
  metadata: unknown,
): SystemWorkflowDuplicateMetadata | null {
  const duplicateMetadata =
    getMetadataRecord(metadata)[SYSTEM_WORKFLOW_DUPLICATE_METADATA_KEY];

  if (
    !duplicateMetadata ||
    typeof duplicateMetadata !== 'object' ||
    Array.isArray(duplicateMetadata)
  ) {
    return null;
  }

  const record = duplicateMetadata as Record<string, unknown>;
  if (
    typeof record.canonicalId !== 'string' ||
    typeof record.sourceWorkflowId !== 'string'
  ) {
    return null;
  }

  return record as SystemWorkflowDuplicateMetadata;
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

  const sourceWorkflowVersion = normalizeSystemWorkflowVersion(
    systemWorkflow.version,
  );
  const sourceWorkflowChangeSummary =
    systemWorkflow.changeSummary ?? SYSTEM_WORKFLOW_TEMPLATE_CHANGE_SUMMARY;

  return {
    ...duplicatedMetadata,
    [SYSTEM_WORKFLOW_DUPLICATE_METADATA_KEY]: {
      canonicalId: systemWorkflow.canonicalId,
      currentSystemWorkflowChangeSummary: sourceWorkflowChangeSummary,
      currentSystemWorkflowVersion: sourceWorkflowVersion,
      credentialPolicy: systemWorkflow.credentialPolicy,
      duplicatedAt: new Date().toISOString(),
      productizationIssue: systemWorkflow.productizationIssue,
      sourceIssue: systemWorkflow.sourceIssue,
      sourceWorkflowChangeSummary,
      sourceWorkflowId,
      sourceWorkflowVersion,
      upgradeEligible: false,
      upgradePolicy: 'manual',
      upgradeStatus: 'current',
    },
  };
}

export function buildSystemWorkflowUpgradeMetadata(
  duplicateMetadata: SystemWorkflowDuplicateMetadata,
  currentSystemWorkflow: SystemWorkflowMetadata,
): SystemWorkflowDuplicateMetadata {
  const currentSystemWorkflowVersion = normalizeSystemWorkflowVersion(
    currentSystemWorkflow.version,
  );
  const sourceWorkflowVersion = normalizeSystemWorkflowVersion(
    duplicateMetadata.sourceWorkflowVersion,
  );
  const upgradeEligible = currentSystemWorkflowVersion > sourceWorkflowVersion;

  return {
    ...duplicateMetadata,
    currentSystemWorkflowChangeSummary:
      currentSystemWorkflow.changeSummary ??
      SYSTEM_WORKFLOW_TEMPLATE_CHANGE_SUMMARY,
    currentSystemWorkflowVersion,
    upgradeEligible,
    upgradeStatus: upgradeEligible ? 'upgrade_available' : 'current',
  };
}

function normalizeSystemWorkflowVersion(version: unknown): number {
  return typeof version === 'number' && Number.isInteger(version) && version > 0
    ? version
    : SYSTEM_WORKFLOW_TEMPLATE_VERSION;
}
