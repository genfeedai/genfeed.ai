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
