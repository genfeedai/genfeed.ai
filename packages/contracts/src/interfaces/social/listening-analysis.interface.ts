import type { IBaseEntity, IBrand, IOrganization } from '../index';
import type {
  IListeningEvidence,
  IListeningTopic,
} from './listening-topic.interface';

export const LISTENING_ANALYSIS_METHODOLOGY_VERSION =
  'deterministic-keyword-v1' as const;

export type ListeningSignalType =
  | 'volume'
  | 'change'
  | 'sentiment_direction'
  | 'comparative';

export type ListeningSignalStatus = 'sufficient' | 'insufficient_evidence';

export type ListeningThemeReviewState =
  | 'unreviewed'
  | 'acknowledged'
  | 'deferred';

export type ReviewListeningThemeState = Exclude<
  ListeningThemeReviewState,
  'unreviewed'
>;

export type ListeningInsufficiencyReason =
  | 'missing_evidence'
  | 'stale_evidence'
  | 'underpowered_evidence'
  | 'source_coverage_gap';

export interface AnalyzeListeningTopicInput {
  currentWindowStart: string;
  currentWindowEnd: string;
  previousWindowStart: string;
  previousWindowEnd: string;
  minimumEvidencePerWindow?: number;
}

export interface IListeningTheme extends IBaseEntity {
  organizationId: string;
  organization?: IOrganization | string;
  brandId: string;
  brand?: IBrand | string;
  topicId: string;
  topic?: IListeningTopic | string;
  label: string;
  clusterKey: string;
  methodologyVersion: string;
  analysisKey: string;
  currentWindowStart: string;
  currentWindowEnd: string;
  previousWindowStart: string;
  previousWindowEnd: string;
  evidenceIds: string[];
  idempotencyKey: string;
  reviewState: ListeningThemeReviewState;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
}

export interface IListeningSignal extends IBaseEntity {
  organizationId: string;
  organization?: IOrganization | string;
  brandId: string;
  brand?: IBrand | string;
  topicId: string;
  topic?: IListeningTopic | string;
  themeId?: string | null;
  theme?: IListeningTheme | string | null;
  signalType: ListeningSignalType;
  status: ListeningSignalStatus;
  insufficiencyReason?: ListeningInsufficiencyReason | null;
  value: number | null;
  confidence: number;
  methodologyVersion: string;
  analysisKey: string;
  currentWindowStart: string;
  currentWindowEnd: string;
  previousWindowStart: string;
  previousWindowEnd: string;
  includedSourceIds: string[];
  excludedSourceIds: string[];
  evidenceIds: string[];
  idempotencyKey: string;
}

export interface IListeningThemeDocument {
  id: string;
  organizationId: string;
  brandId: string;
  topicId: string;
  label: string;
  clusterKey: string;
  methodologyVersion: string;
  analysisKey: string;
  currentWindowStart: Date;
  currentWindowEnd: Date;
  previousWindowStart: Date;
  previousWindowEnd: Date;
  evidenceIds: string[];
  idempotencyKey: string;
  reviewState: ListeningThemeReviewState;
  reviewedAt?: Date | null;
  reviewedBy?: string | null;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IListeningSignalDocument {
  id: string;
  organizationId: string;
  brandId: string;
  topicId: string;
  themeId?: string | null;
  signalType: ListeningSignalType;
  status: ListeningSignalStatus;
  insufficiencyReason?: ListeningInsufficiencyReason | null;
  value: number | null;
  confidence: number;
  methodologyVersion: string;
  analysisKey: string;
  currentWindowStart: Date;
  currentWindowEnd: Date;
  previousWindowStart: Date;
  previousWindowEnd: Date;
  includedSourceIds: string[];
  excludedSourceIds: string[];
  evidenceIds: string[];
  idempotencyKey: string;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ListeningAnalysisResultBase {
  analysisKey: string;
  methodologyVersion: string;
  themes: IListeningThemeDocument[];
  signals: IListeningSignalDocument[];
}

export interface SufficientListeningAnalysisResult
  extends ListeningAnalysisResultBase {
  status: 'sufficient';
}

export interface InsufficientListeningAnalysisResult
  extends ListeningAnalysisResultBase {
  status: 'insufficient_evidence';
  reason: ListeningInsufficiencyReason;
}

export type ListeningAnalysisResult =
  | SufficientListeningAnalysisResult
  | InsufficientListeningAnalysisResult;

export interface ISocialIntelligenceTopicBundle {
  topic: IListeningTopic;
  themes: IListeningTheme[];
  signals: IListeningSignal[];
  evidence: IListeningEvidence[];
}

export interface ListeningInboxScope {
  organizationId: string;
  brandId: string;
}

export type SocialIntelligenceInboxState =
  | 'loading'
  | 'empty'
  | 'ready'
  | 'partial'
  | 'forbidden'
  | 'rate_limited'
  | 'failed';
