import type {
  ContentLearningArm,
  ContentLearningMode,
} from '../../enums/content-learning.enum';

export type LearningFormat =
  | 'text'
  | 'image'
  | 'carousel'
  | 'video'
  | 'short'
  | 'thread';
export type LearningObjective =
  | 'awareness'
  | 'engagement'
  | 'authority-proxy'
  | 'conversion-click'
  | 'retention-watch';
export type LearningAvailability =
  | 'observed'
  | 'unavailable'
  | 'unauthorized'
  | 'expired'
  | 'failed';
export type LearningMetricName =
  | 'exposure'
  | 'views'
  | 'impressions'
  | 'reach'
  | 'videoViews'
  | 'likes'
  | 'comments'
  | 'shares'
  | 'saves'
  | 'clicks'
  | 'averageWatchTimeSeconds';
export interface LearningMetric {
  value?: number;
  availability: LearningAvailability;
  source: string;
}
export interface LearningCollectionReceiptV1 {
  version: 1;
  outcome: 'observed' | 'retryable_failure' | 'terminal_unavailable';
  reasonCode: string | null;
}
export interface LearningMetrics {
  /** Server-derived provider collection status, never customer authority. */
  collection?: LearningCollectionReceiptV1;
  metrics: Partial<Record<LearningMetricName, LearningMetric>>;
  isPaid?: boolean;
  isPinned?: boolean;
  providerAsOf?: string;
  format?: LearningFormat;
}
export interface LearningGenerationContext {
  credentialId?: string;
  objective?: LearningObjective;
  requestKey: string;
  candidateIndex: number;
  parentRequestId?: string;
  runId?: string;
  workflowExecutionId?: string;
  generationId?: string;
}
export interface LearningGenerationReceipt {
  decisionId?: string;
  credentialId?: string;
  reason?: string;
  mode: ContentLearningMode | 'no_destination' | 'unavailable';
  accountRevision?: number;
  scopeRevision?: number;
  epoch?: number;
  armId?: ContentLearningArm;
  probabilities?: Record<string, number>;
  selectedProbability?: number;
  assignment?: 'pilot' | 'control';
  assignmentProbability?: number;
  executionProbability?: number;
  executionProbabilities?: Record<string, number>;
  treatmentProbabilities?: Record<string, number>;
  controlProbabilities?: Record<string, number>;
  cellDescriptor?: LearningCellDescriptor;
  descriptorHash?: string;
  policyVersionId?: string;
  sharedReleaseId?: string;
  sharedReleaseRevision?: number;
  baselineId?: string;
  configVersion: string;
  synthetic: boolean;
}
export interface LearningNumericRow {
  sourceFingerprint: string;
  accountGroup: string;
  decisionAt: string;
  measuredAt: string;
  features: number[];
  armId: string;
  probabilities: Record<string, number>;
  reward: number;
  synthetic: boolean;
}
export interface LearningCellDescriptor {
  platform: string;
  format: LearningFormat;
  objective: LearningObjective;
  exposureSource: LearningMetricName;
  metricWeights: Array<[LearningMetricName, number]>;
  retention: boolean;
  windowId: '48h-v1';
  configVersion: 'rl-reward-v1-experimental';
  featureSchema: 'numeric-nine-v1';
  armCatalogVersion: 'learning-arms-v1';
}
export interface LearningScope {
  organizationId: string;
  brandId: string;
  credentialId: string;
  platform: string;
  format: LearningFormat;
  objective: LearningObjective;
  rewardProfileId: string;
}
export interface LearningAccountView {
  id: string;
  organizationId: string;
  brandId: string;
  credentialId: string;
  mode: ContentLearningMode;
  revision: number;
  epoch: number;
  sharingConsentVersion: number | null;
  sharedReleasePreference: 'automatic' | 'disabled' | 'pinned';
  pinnedReleaseId: string | null;
  approvedArmIds: string[];
  baselineCount: number;
  activePolicyId: string | null;
  failureReason: string | null;
  driftState: string | null;
}
export interface LearningOperationView {
  id: string;
  type: string;
  status: string;
  beforeRevision: number | null;
  afterRevision: number | null;
  error: string | null;
  resultReferences: unknown;
}

export interface LearningControlInput {
  action:
    | 'live'
    | 'pause'
    | 'resume'
    | 'reset'
    | 'rollback'
    | 'shadow'
    | 'disable';
  expectedRevision: number;
  requestId: string;
  reason: string;
  approvedArmIds?: string[];
  policyId?: string;
}
export interface LearningConsentInput {
  enabled: boolean;
  noticeVersion: string;
  expectedRevision: number;
  requestId: string;
}
export interface LearningReceivingInput {
  preference: 'automatic' | 'disabled' | 'pinned';
  releaseId?: string;
  expectedRevision: number;
  requestId: string;
}
export interface LearningResourceView {
  id: string;
  status?: string;
  synthetic?: boolean;
  [field: string]: unknown;
}
export interface LearningDatasetInput {
  rightsStatement: string;
  profile: LearningObjective;
  cell: string;
  cutoff: string;
  requestId: string;
  rows?: LearningNumericRow[];
  sourceAccountIds?: string[];
}

export function captureLearningMetrics(
  raw: Record<string, unknown>,
  mapping: Partial<Record<LearningMetricName, string>>,
): LearningMetrics {
  const metrics: LearningMetrics['metrics'] = {};
  for (const [metric, source] of Object.entries(mapping)) {
    const value = raw[source];
    metrics[metric as LearningMetricName] =
      typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? { value, availability: 'observed', source }
        : { availability: 'unavailable', source };
  }
  return {
    collection: { version: 1, outcome: 'observed', reasonCode: null },
    metrics,
    ...(typeof raw.isPaid === 'boolean' ? { isPaid: raw.isPaid } : {}),
    ...(typeof raw.isPinned === 'boolean' ? { isPinned: raw.isPinned } : {}),
  };
}

export interface LearningExperimentSpecV1 {
  schemaVersion: 1;
  kind: 'private_pilot' | 'shared_stage';
  cellKey: string;
  configVersion: string;
  featureVersion: string;
  rewardVersion: string;
  checkpointVersion: string;
  candidateId: string;
  candidateHash: string;
  controlId: string;
  controlHash: string;
  builtInControlVersion?: string;
  stage?: 'canary' | 'limited';
  releaseRevision?: number;
  format: LearningFormat;
  objective: LearningObjective;
  rewardProfileId: string;
  startAt: string;
  endAt: string;
  assignmentUnit: 'request_destination_candidate';
  treatmentProbability: 0.1 | 0.5;
  cohortFraction: 1 | 0.05 | 0.25;
  seedCommitment: string;
  deadlines: {
    generationHours: 24;
    publicationHours: 168;
    checkpointHours: 49;
    settlementGraceHours: 24;
  };
  analysisVersion: 'rl-experiment-v1';
  primary: 'composite_reward';
  gateVersion: 'rl-promotion-v1';
  costBasis: 'observed_vendor_micro_usd';
  cadenceBasis: 'published_descendants_per_opportunity_day';
  approvedArmIds: string[];
  sourceManifestHash: string;
  synthetic: boolean;
}
export interface LearningEstimateV1 {
  value: number | null;
  lower95: number | null;
  upper95: number | null;
  unavailableReasons: string[];
}
export interface LearningExperimentGroupV1 {
  assigned: number;
  generated: number;
  readinessKnown: number;
  publishable: number;
  approved: number;
  published: number;
  unchanged: number;
  matureEligible: number;
  censorCounts: Record<string, number>;
  costComplete: number;
  attemptCounts: number;
  exposureDays: number;
  evidenceManifestHash: string;
}
export interface LearningEvaluationReportV1 {
  schemaVersion: 1;
  kind: 'offline' | 'online';
  status: 'passed' | 'failed' | 'inconclusive';
  reasonCodes: string[];
  experimentId?: string;
  specHash?: string;
  datasetId?: string;
  runId?: string;
  manifestHash?: string;
  candidateHash: string;
  controlHash: string;
  stage?: string;
  releaseRevision?: number;
  analysisVersion: string;
  configVersion: string;
  cutoff: string;
  createdAt: string;
  synthetic: boolean;
  invalidationRevision: number;
  groups?: {
    control: LearningExperimentGroupV1;
    treatment: LearningExperimentGroupV1;
  };
  estimates: Record<string, LearningEstimateV1>;
  guardrails: Array<{
    name: string;
    status: 'passed' | 'failed' | 'inconclusive';
    threshold: number;
    value: number | null;
    reasons: string[];
    evidenceIds: string[];
  }>;
  offline?: {
    ips: LearningEstimateV1;
    snips: LearningEstimateV1;
    doublyRobust: LearningEstimateV1;
    clipped20: LearningEstimateV1;
    ess: number | null;
    essUnavailableReasons: string[];
    support: boolean;
    splitCounts: Record<string, number>;
    armCounts: Record<string, number>;
  };
}
export type LearningEvaluationRequestV1 =
  | {
      kind: 'offline';
      datasetId: string;
      candidateArtifactId: string;
      baselineArtifactId: string;
      requestId: string;
    }
  | {
      kind: 'online';
      experimentId: string;
      expectedRevision: number;
      requestId: string;
    };
export type LearningExperimentPayloadV1 =
  | {
      kind: 'artifact';
      artifactHash: string;
      ingredientVersions: Array<{ id: string; version: string }>;
      textNonempty: boolean;
      generationClosed: boolean;
      noProviderDispatch?: boolean;
    }
  | {
      kind: 'readiness';
      artifactHash: string;
      gateVersion: string;
      scopeValid: boolean;
      textNonempty: boolean;
      mediaStatus: 'ready' | 'not_ready' | 'not_applicable' | 'unknown';
      blockerCodes: string[];
    }
  | {
      kind: 'approval';
      artifactHash: string;
      artifactVersionPinId: string;
      scopeDigest: string;
      status: 'approved' | 'rejected' | 'invalidated';
      approvalId: string;
    }
  | {
      kind: 'publish';
      postId: string;
      finalizationId: string;
      artifactHash: string;
      originalArtifact: boolean;
      publishedAt: string;
    }
  | {
      kind: 'edit';
      postId?: string;
      originalArtifactHash: string;
      editedArtifactHash: string;
    }
  | {
      kind: 'safety';
      critical: boolean;
      incidentId: string;
      deterministicGuardVersion?: string;
    }
  | {
      kind: 'cost_attempt';
      attemptId: string;
      opportunityIds: string[];
      allocationWeights: number[];
      provider: string;
      model: string;
      startedAt: string;
      workflowExecutionId?: string;
      nodeId?: string;
      runId?: string;
      ingredientId?: string;
    }
  | {
      kind: 'cost_settlement';
      attemptId: string;
      ledgerId: string;
      ledgerKind: 'llm' | 'media';
      ledgerFingerprint: string;
      vendorCostMicros: number | null;
      costEvidence: 'observed' | 'calculated' | 'byok' | 'unknown' | 'pending';
      terminal: boolean;
    }
  | {
      kind: 'cadence';
      cadenceId?: string;
      slotReservationId?: string;
      instant?: string;
      intentHash: string;
      changed: boolean;
      descendantPostIds: string[];
      enumerationComplete: boolean;
    }
  | { kind: 'withdrawal'; reason: string; actorUserId: string }
  | {
      kind: 'report';
      report: LearningEvaluationReportV1;
      reportHash: string;
      seedReveal?: string;
    };
export interface LearningCostAttributionV1 {
  organizationId: string;
  opportunityIds: readonly string[];
  allocationWeights: readonly number[];
  attemptId?: string;
  workflowExecutionId?: string;
  nodeId?: string;
  runId?: string;
  ingredientId?: string;
}

export type LearningDependencyKindV1 =
  | 'dataset'
  | 'run'
  | 'shared-policy'
  | 'release'
  | 'config'
  | 'organization'
  | 'brand'
  | 'credential'
  | 'post'
  | 'account'
  | 'checkpoint'
  | 'baseline'
  | 'decision'
  | 'reward'
  | 'policy'
  | 'consent'
  | 'experiment'
  | 'enrollment'
  | 'opportunity'
  | 'experiment-event'
  | 'provider_attempt'
  | 'llm_vendor_cost'
  | 'media_vendor_cost'
  | 'publish_approval'
  | 'post_publish_finalization'
  | 'content_version_pin';
export interface LearningDependencyRefV1 {
  kind: LearningDependencyKindV1;
  id: string;
  organizationId: string | null;
  version: string;
}

export interface LearningAllocatedCostV1 {
  attemptId: string;
  ledgerKind: 'llm' | 'media';
  ledgerId: string;
  ledgerFingerprint: string;
  vendorCostMicros: number;
  opportunityIds: readonly string[];
}

export interface LearningRunDispatchReceiptV1 {
  dispatchVersion: 1;
  runId: string;
  datasetId: string;
  retryOfOperationId: string | null;
  attemptCount: number;
  nextAttemptAt: string | null;
  claimedStartedAt: string | null;
  terminalResult?: LearningRunDispatchTerminalResultV1;
}

export interface LearningRunDispatchTerminalResultV1 {
  runStatus:
    | 'completed'
    | 'insufficient_data'
    | 'failed'
    | 'cancelled'
    | 'invalidated';
  reasonCode: string | null;
  resultArtifactId: string | null;
  completedAt: string;
  trainingCount: number | null;
  requiredTrainingCount: 30 | null;
}
export function validLearningRunTerminalResult(
  value: unknown,
): value is LearningRunDispatchTerminalResultV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  const nullableCode = (v: unknown) =>
    v === null || (typeof v === 'string' && v.length > 0 && v.length <= 256);
  if (
    ![
      'completed',
      'insufficient_data',
      'failed',
      'cancelled',
      'invalidated',
    ].includes(String(raw.runStatus)) ||
    !nullableCode(raw.reasonCode) ||
    !nullableCode(raw.resultArtifactId) ||
    typeof raw.completedAt !== 'string' ||
    !Number.isFinite(new Date(raw.completedAt).getTime()) ||
    new Date(raw.completedAt).toISOString() !== raw.completedAt
  )
    return false;
  if (raw.runStatus === 'insufficient_data')
    return (
      raw.reasonCode === 'minimum_training_30' &&
      raw.resultArtifactId === null &&
      Number.isSafeInteger(raw.trainingCount) &&
      Number(raw.trainingCount) >= 0 &&
      Number(raw.trainingCount) < 30 &&
      raw.requiredTrainingCount === 30
    );
  if (raw.trainingCount !== null || raw.requiredTrainingCount !== null)
    return false;
  if (raw.runStatus === 'completed') return raw.reasonCode === null;
  return (
    raw.resultArtifactId === null &&
    (raw.runStatus === 'cancelled'
      ? raw.reasonCode === 'cancelled'
      : typeof raw.reasonCode === 'string')
  );
}

export function validLearningRunDispatchReceipt(
  value: unknown,
): value is LearningRunDispatchReceiptV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  const id = (value: unknown) =>
    typeof value === 'string' && value.length > 0 && value.length <= 256;
  const timestamp = (value: unknown) =>
    value === null ||
    (typeof value === 'string' &&
      Number.isFinite(new Date(value).getTime()) &&
      new Date(value).toISOString() === value);
  if (
    raw.dispatchVersion !== 1 ||
    !id(raw.runId) ||
    !id(raw.datasetId) ||
    !(raw.retryOfOperationId === null || id(raw.retryOfOperationId)) ||
    !Number.isInteger(raw.attemptCount) ||
    Number(raw.attemptCount) < 0 ||
    Number(raw.attemptCount) > 3 ||
    !timestamp(raw.nextAttemptAt) ||
    !timestamp(raw.claimedStartedAt) ||
    (raw.terminalResult !== undefined &&
      !validLearningRunTerminalResult(raw.terminalResult))
  )
    return false;
  return true;
}
