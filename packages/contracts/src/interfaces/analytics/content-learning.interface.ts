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
export interface LearningMetrics {
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
  epoch?: number;
  armId?: ContentLearningArm;
  probabilities?: Record<string, number>;
  selectedProbability?: number;
  assignment?: 'pilot' | 'control';
  assignmentProbability?: number;
  executionProbability?: number;
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
