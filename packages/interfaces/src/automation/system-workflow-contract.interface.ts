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
  const systemWorkflow = isRecord(metadata)
    ? metadata[SYSTEM_WORKFLOW_METADATA_KEY]
    : undefined;

  return normalizeSystemWorkflowMetadata(systemWorkflow);
}

export function getSystemWorkflowDuplicateMetadata(
  metadata: unknown,
): SystemWorkflowDuplicateMetadata | null {
  const duplicateMetadata = isRecord(metadata)
    ? metadata[SYSTEM_WORKFLOW_DUPLICATE_METADATA_KEY]
    : undefined;

  return normalizeSystemWorkflowDuplicateMetadata(duplicateMetadata);
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
  if (duplicateMetadata.canonicalId !== currentSystemWorkflow.canonicalId) {
    throw new Error(
      `Cannot build system workflow upgrade metadata: duplicate canonicalId "${duplicateMetadata.canonicalId}" does not match current canonicalId "${currentSystemWorkflow.canonicalId}".`,
    );
  }

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

function normalizeSystemWorkflowMetadata(
  value: unknown,
): SystemWorkflowMetadata | null {
  if (!isRecord(value)) {
    return null;
  }

  const canonicalId = value.canonicalId;
  const changeSummary =
    value.changeSummary ?? SYSTEM_WORKFLOW_TEMPLATE_CHANGE_SUMMARY;
  const credentialPolicy = value.credentialPolicy ?? 'tenant-connected-account';
  const duplicable = value.duplicable ?? true;
  const productizationIssue =
    value.productizationIssue ?? SYSTEM_WORKFLOW_PRODUCTIZATION_ISSUE;
  const version = value.version ?? SYSTEM_WORKFLOW_TEMPLATE_VERSION;
  const visibility = value.visibility ?? 'organization';

  if (
    typeof canonicalId !== 'string' ||
    canonicalId.length === 0 ||
    typeof changeSummary !== 'string' ||
    !isSystemWorkflowCredentialPolicy(credentialPolicy) ||
    typeof duplicable !== 'boolean' ||
    value.immutable !== true ||
    value.kind !== 'system-workflow' ||
    value.owner !== SYSTEM_WORKFLOW_OWNER ||
    productizationIssue !== SYSTEM_WORKFLOW_PRODUCTIZATION_ISSUE ||
    !isOptionalIssueNumber(value.sourceIssue) ||
    !isPositiveInteger(version) ||
    visibility !== 'organization'
  ) {
    return null;
  }

  return {
    canonicalId,
    changeSummary,
    credentialPolicy,
    duplicable,
    immutable: true,
    kind: 'system-workflow',
    owner: SYSTEM_WORKFLOW_OWNER,
    productizationIssue: SYSTEM_WORKFLOW_PRODUCTIZATION_ISSUE,
    sourceIssue: value.sourceIssue,
    version,
    visibility: 'organization',
  };
}

function normalizeSystemWorkflowDuplicateMetadata(
  value: unknown,
): SystemWorkflowDuplicateMetadata | null {
  if (!isRecord(value)) {
    return null;
  }

  const canonicalId = value.canonicalId;
  const credentialPolicy = value.credentialPolicy ?? 'tenant-connected-account';
  const duplicatedAt = value.duplicatedAt ?? '';
  const productizationIssue =
    value.productizationIssue ?? SYSTEM_WORKFLOW_PRODUCTIZATION_ISSUE;
  const sourceWorkflowChangeSummary =
    value.sourceWorkflowChangeSummary ??
    SYSTEM_WORKFLOW_TEMPLATE_CHANGE_SUMMARY;
  const sourceWorkflowId = value.sourceWorkflowId;
  const sourceWorkflowVersion =
    value.sourceWorkflowVersion ?? SYSTEM_WORKFLOW_TEMPLATE_VERSION;
  const currentSystemWorkflowChangeSummary =
    value.currentSystemWorkflowChangeSummary ?? sourceWorkflowChangeSummary;
  const currentSystemWorkflowVersion =
    value.currentSystemWorkflowVersion ?? sourceWorkflowVersion;
  const upgradeEligible = value.upgradeEligible ?? false;
  const upgradePolicy = value.upgradePolicy ?? 'manual';
  const upgradeStatus = value.upgradeStatus ?? 'current';

  if (
    typeof canonicalId !== 'string' ||
    canonicalId.length === 0 ||
    typeof currentSystemWorkflowChangeSummary !== 'string' ||
    !isPositiveInteger(currentSystemWorkflowVersion) ||
    !isSystemWorkflowCredentialPolicy(credentialPolicy) ||
    typeof duplicatedAt !== 'string' ||
    productizationIssue !== SYSTEM_WORKFLOW_PRODUCTIZATION_ISSUE ||
    !isOptionalIssueNumber(value.sourceIssue) ||
    typeof sourceWorkflowChangeSummary !== 'string' ||
    typeof sourceWorkflowId !== 'string' ||
    sourceWorkflowId.length === 0 ||
    !isPositiveInteger(sourceWorkflowVersion) ||
    typeof upgradeEligible !== 'boolean' ||
    upgradePolicy !== 'manual' ||
    !isSystemWorkflowUpgradeStatus(upgradeStatus)
  ) {
    return null;
  }

  return {
    canonicalId,
    currentSystemWorkflowChangeSummary,
    currentSystemWorkflowVersion,
    credentialPolicy,
    duplicatedAt,
    productizationIssue: SYSTEM_WORKFLOW_PRODUCTIZATION_ISSUE,
    sourceIssue: value.sourceIssue,
    sourceWorkflowChangeSummary,
    sourceWorkflowId,
    sourceWorkflowVersion,
    upgradeEligible,
    upgradePolicy: 'manual',
    upgradeStatus,
  };
}

function normalizeSystemWorkflowVersion(version: unknown): number {
  return isPositiveInteger(version)
    ? version
    : SYSTEM_WORKFLOW_TEMPLATE_VERSION;
}
