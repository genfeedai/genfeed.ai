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
  if (isRecord(metadata)) {
    return { ...metadata };
  }

  return {};
}

export function getSystemWorkflowMetadata(
  metadata: unknown,
): SystemWorkflowMetadata | null {
  const systemWorkflow =
    getMetadataRecord(metadata)[SYSTEM_WORKFLOW_METADATA_KEY];

  if (!isRecord(systemWorkflow) || !isSystemWorkflowMetadata(systemWorkflow)) {
    return null;
  }

  return systemWorkflow;
}

export function getSystemWorkflowDuplicateMetadata(
  metadata: unknown,
): SystemWorkflowDuplicateMetadata | null {
  const duplicateMetadata =
    getMetadataRecord(metadata)[SYSTEM_WORKFLOW_DUPLICATE_METADATA_KEY];

  if (
    !isRecord(duplicateMetadata) ||
    !isSystemWorkflowDuplicateMetadata(duplicateMetadata)
  ) {
    return null;
  }

  return duplicateMetadata;
}

export function isProtectedSystemWorkflowMetadata(metadata: unknown): boolean {
  return getSystemWorkflowMetadata(metadata)?.immutable === true;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSystemWorkflowCredentialPolicy(
  value: unknown,
): value is SystemWorkflowCredentialPolicy {
  return value === 'tenant-connected-account' || value === 'system-policy';
}

function isSystemWorkflowUpgradeStatus(
  value: unknown,
): value is SystemWorkflowUpgradeStatus {
  return value === 'current' || value === 'upgrade_available';
}

function isOptionalIssueNumber(value: unknown): value is number | undefined {
  return (
    value === undefined ||
    (typeof value === 'number' && Number.isInteger(value) && value > 0)
  );
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isSystemWorkflowMetadata(
  record: Record<string, unknown>,
): record is SystemWorkflowMetadata {
  return (
    typeof record.canonicalId === 'string' &&
    record.canonicalId.length > 0 &&
    typeof record.changeSummary === 'string' &&
    isSystemWorkflowCredentialPolicy(record.credentialPolicy) &&
    record.duplicable === true &&
    record.immutable === true &&
    record.kind === 'system-workflow' &&
    record.owner === SYSTEM_WORKFLOW_OWNER &&
    record.productizationIssue === SYSTEM_WORKFLOW_PRODUCTIZATION_ISSUE &&
    isOptionalIssueNumber(record.sourceIssue) &&
    isPositiveInteger(record.version) &&
    record.visibility === 'organization'
  );
}

function isSystemWorkflowDuplicateMetadata(
  record: Record<string, unknown>,
): record is SystemWorkflowDuplicateMetadata {
  return (
    typeof record.canonicalId === 'string' &&
    record.canonicalId.length > 0 &&
    typeof record.currentSystemWorkflowChangeSummary === 'string' &&
    isPositiveInteger(record.currentSystemWorkflowVersion) &&
    isSystemWorkflowCredentialPolicy(record.credentialPolicy) &&
    typeof record.duplicatedAt === 'string' &&
    record.productizationIssue === SYSTEM_WORKFLOW_PRODUCTIZATION_ISSUE &&
    isOptionalIssueNumber(record.sourceIssue) &&
    typeof record.sourceWorkflowChangeSummary === 'string' &&
    typeof record.sourceWorkflowId === 'string' &&
    record.sourceWorkflowId.length > 0 &&
    isPositiveInteger(record.sourceWorkflowVersion) &&
    typeof record.upgradeEligible === 'boolean' &&
    record.upgradePolicy === 'manual' &&
    isSystemWorkflowUpgradeStatus(record.upgradeStatus)
  );
}

function normalizeSystemWorkflowVersion(version: unknown): number {
  return isPositiveInteger(version)
    ? version
    : SYSTEM_WORKFLOW_TEMPLATE_VERSION;
}
