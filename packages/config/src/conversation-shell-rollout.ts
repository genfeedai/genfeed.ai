export const CONVERSATION_SHELL_FLAG_KEY = 'conversation_shell';

export const CONVERSATION_SHELL_COHORTS = ['internal', 'opt_in'] as const;

export const CONVERSATION_SHELL_DEPLOYMENT_ORDER = [
  'community',
  'desktop_self_hosted',
  'desktop_cloud',
  'saas',
] as const;

export const CONVERSATION_SHELL_EVALUATION_REASONS = [
  'cohort_disabled',
  'deployment_not_enabled',
  'disabled',
  'enabled',
  'invalid_configuration',
  'missing_attributes',
  'organization_not_targeted',
] as const;

export type ConversationShellCohort =
  (typeof CONVERSATION_SHELL_COHORTS)[number];

export type ConversationShellDeploymentMode =
  (typeof CONVERSATION_SHELL_DEPLOYMENT_ORDER)[number];

export type ConversationShellClientSurface = 'desktop' | 'web';

export type ConversationShellDeployment = 'cloud' | 'self-hosted';

export type ConversationShellEvaluationReason =
  (typeof CONVERSATION_SHELL_EVALUATION_REASONS)[number];

export interface ConversationShellRolloutConfig {
  readonly configVersion: string;
  readonly isEnabled: boolean;
  readonly enabledCohorts: readonly ConversationShellCohort[];
  readonly enabledDeploymentModes: readonly ConversationShellDeploymentMode[];
  readonly organizations: Readonly<
    Record<ConversationShellCohort, readonly string[]>
  >;
  readonly rollbackRevision: number;
  readonly schemaVersion: 1;
}

export interface ConversationShellEvaluationAttributes {
  readonly client: ConversationShellClientSurface;
  readonly deployment: ConversationShellDeployment;
  readonly organizationId: string;
}

export interface ConversationShellEvaluation {
  readonly cohort: ConversationShellCohort | null;
  readonly configVersion: string | null;
  readonly deploymentMode: ConversationShellDeploymentMode;
  readonly isEnabled: boolean;
  readonly evaluatedAt: string;
  readonly reason: ConversationShellEvaluationReason;
  readonly rollbackRevision: number | null;
  readonly schemaVersion: 1;
}

export type ConversationShellRolloutConfigParseResult =
  | {
      readonly config: ConversationShellRolloutConfig;
      readonly error: null;
    }
  | {
      readonly config: null;
      readonly error: 'invalid_configuration' | 'missing_configuration';
    };

const SAFE_CONFIG_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SAFE_ORGANIZATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

export function isConversationShellEvaluation(
  value: unknown,
): value is ConversationShellEvaluation {
  if (!isRecord(value)) {
    return false;
  }

  const cohort = value.cohort;
  const configVersion = value.configVersion;
  const deploymentMode = value.deploymentMode;
  const isEnabled = value.isEnabled;
  const evaluatedAt = value.evaluatedAt;
  const reason = value.reason;
  const rollbackRevision = value.rollbackRevision;
  const hasValidCohort =
    cohort === null ||
    CONVERSATION_SHELL_COHORTS.some((candidate) => candidate === cohort);
  const hasValidConfigVersion =
    configVersion === null ||
    (typeof configVersion === 'string' &&
      SAFE_CONFIG_VERSION_PATTERN.test(configVersion));
  const hasValidRollbackRevision =
    rollbackRevision === null ||
    (Number.isSafeInteger(rollbackRevision) && Number(rollbackRevision) >= 0);

  if (
    !hasOnlyKeys(value, [
      'cohort',
      'configVersion',
      'deploymentMode',
      'isEnabled',
      'evaluatedAt',
      'reason',
      'rollbackRevision',
      'schemaVersion',
    ]) ||
    !hasValidCohort ||
    !hasValidConfigVersion ||
    !hasValidRollbackRevision ||
    !CONVERSATION_SHELL_DEPLOYMENT_ORDER.some(
      (candidate) => candidate === deploymentMode,
    ) ||
    typeof isEnabled !== 'boolean' ||
    typeof evaluatedAt !== 'string' ||
    !Number.isFinite(new Date(evaluatedAt).getTime()) ||
    !CONVERSATION_SHELL_EVALUATION_REASONS.some(
      (candidate) => candidate === reason,
    ) ||
    value.schemaVersion !== 1
  ) {
    return false;
  }

  return isEnabled
    ? reason === 'enabled' &&
        cohort !== null &&
        configVersion !== null &&
        rollbackRevision !== null
    : reason !== 'enabled';
}

function isConversationShellCohort(
  value: unknown,
): value is ConversationShellCohort {
  return CONVERSATION_SHELL_COHORTS.some((cohort) => cohort === value);
}

function isConversationShellDeploymentMode(
  value: unknown,
): value is ConversationShellDeploymentMode {
  return CONVERSATION_SHELL_DEPLOYMENT_ORDER.some((mode) => mode === value);
}

function hasUniqueValues<T>(values: readonly T[]): boolean {
  return new Set(values).size === values.length;
}

function isDeploymentPrefix(
  modes: readonly ConversationShellDeploymentMode[],
): boolean {
  return modes.every(
    (mode, index) => CONVERSATION_SHELL_DEPLOYMENT_ORDER[index] === mode,
  );
}

function parseStringArray(
  value: unknown,
  predicate: (entry: string) => boolean,
): readonly string[] | null {
  if (
    !Array.isArray(value) ||
    !value.every((entry) => typeof entry === 'string')
  ) {
    return null;
  }

  const normalized = value.map((entry) => entry.trim());
  if (!normalized.every(predicate) || !hasUniqueValues(normalized)) {
    return null;
  }

  return Object.freeze(normalized);
}

export function parseConversationShellRolloutConfig(
  value: unknown,
): ConversationShellRolloutConfigParseResult {
  if (value === undefined || value === null) {
    return { config: null, error: 'missing_configuration' };
  }

  if (!isRecord(value)) {
    return { config: null, error: 'invalid_configuration' };
  }

  const enabledCohorts = parseStringArray(
    value.enabledCohorts,
    isConversationShellCohort,
  ) as readonly ConversationShellCohort[] | null;
  const enabledDeploymentModes = parseStringArray(
    value.enabledDeploymentModes,
    isConversationShellDeploymentMode,
  ) as readonly ConversationShellDeploymentMode[] | null;
  const organizations = value.organizations;
  const configVersion =
    typeof value.configVersion === 'string' ? value.configVersion.trim() : '';

  if (
    !hasOnlyKeys(value, [
      'configVersion',
      'isEnabled',
      'enabledCohorts',
      'enabledDeploymentModes',
      'organizations',
      'rollbackRevision',
      'schemaVersion',
    ]) ||
    value.schemaVersion !== 1 ||
    typeof value.isEnabled !== 'boolean' ||
    !SAFE_CONFIG_VERSION_PATTERN.test(configVersion) ||
    !Number.isSafeInteger(value.rollbackRevision) ||
    Number(value.rollbackRevision) < 0 ||
    !enabledCohorts ||
    !enabledDeploymentModes ||
    !isDeploymentPrefix(enabledDeploymentModes) ||
    !isRecord(organizations) ||
    !hasOnlyKeys(organizations, ['internal', 'opt_in'])
  ) {
    return { config: null, error: 'invalid_configuration' };
  }

  const internalOrganizations = parseStringArray(
    organizations.internal,
    (organizationId) => SAFE_ORGANIZATION_ID_PATTERN.test(organizationId),
  );
  const optInOrganizations = parseStringArray(
    organizations.opt_in,
    (organizationId) => SAFE_ORGANIZATION_ID_PATTERN.test(organizationId),
  );

  if (!internalOrganizations || !optInOrganizations) {
    return { config: null, error: 'invalid_configuration' };
  }

  const allOrganizations = [...internalOrganizations, ...optInOrganizations];
  if (!hasUniqueValues(allOrganizations)) {
    return { config: null, error: 'invalid_configuration' };
  }

  return {
    config: Object.freeze({
      configVersion,
      isEnabled: value.isEnabled,
      enabledCohorts,
      enabledDeploymentModes,
      organizations: Object.freeze({
        internal: internalOrganizations,
        opt_in: optInOrganizations,
      }),
      rollbackRevision: Number(value.rollbackRevision),
      schemaVersion: 1,
    }),
    error: null,
  };
}

export function resolveConversationShellDeploymentMode(
  deployment: ConversationShellDeployment,
  client: ConversationShellClientSurface,
): ConversationShellDeploymentMode {
  if (client === 'desktop') {
    return deployment === 'cloud' ? 'desktop_cloud' : 'desktop_self_hosted';
  }

  return deployment === 'cloud' ? 'saas' : 'community';
}

function findOrganizationCohort(
  config: ConversationShellRolloutConfig,
  organizationId: string,
): ConversationShellCohort | null {
  return (
    CONVERSATION_SHELL_COHORTS.find((cohort) =>
      config.organizations[cohort].includes(organizationId),
    ) ?? null
  );
}

export function evaluateConversationShellRollout(
  parsed: ConversationShellRolloutConfigParseResult,
  attributes: ConversationShellEvaluationAttributes,
  evaluatedAt = new Date(),
): ConversationShellEvaluation {
  const deploymentMode = resolveConversationShellDeploymentMode(
    attributes.deployment,
    attributes.client,
  );
  const base = {
    cohort: null,
    configVersion: parsed.config?.configVersion ?? null,
    deploymentMode,
    isEnabled: false,
    evaluatedAt: evaluatedAt.toISOString(),
    rollbackRevision: parsed.config?.rollbackRevision ?? null,
    schemaVersion: 1,
  } as const;

  if (!parsed.config) {
    return { ...base, reason: 'invalid_configuration' };
  }

  if (!attributes.organizationId.trim()) {
    return { ...base, reason: 'missing_attributes' };
  }

  if (!parsed.config.isEnabled) {
    return { ...base, reason: 'disabled' };
  }

  const cohort = findOrganizationCohort(
    parsed.config,
    attributes.organizationId,
  );
  if (!cohort) {
    return { ...base, reason: 'organization_not_targeted' };
  }

  if (!parsed.config.enabledCohorts.includes(cohort)) {
    return { ...base, cohort, reason: 'cohort_disabled' };
  }

  if (!parsed.config.enabledDeploymentModes.includes(deploymentMode)) {
    return { ...base, cohort, reason: 'deployment_not_enabled' };
  }

  return { ...base, cohort, isEnabled: true, reason: 'enabled' };
}
