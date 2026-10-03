import type { AnalyticsMetricAvailability } from '../../enums/analytics-metric-availability.enum';
import type { TargetAnalyticsCollectionState } from '../../enums/scheduler.enum';
import type {
  ExtensionPublicationAnalyticsAvailability,
  ExtensionPublicationObservedVisibility,
  ExtensionPublicationPlatform,
  ExtensionPublicationUrlIdentity,
} from './extension-publication.interface';

export interface PublicationInsightMetric {
  value: number | null;
  availability: AnalyticsMetricAvailability;
}
export interface PublicationInsightMetrics {
  views: PublicationInsightMetric;
  likes: PublicationInsightMetric;
  comments: PublicationInsightMetric;
  shares: PublicationInsightMetric;
  saves: PublicationInsightMetric;
}
export interface PublicationInsightSample {
  date: string;
  updatedAt: string;
  metrics: PublicationInsightMetrics;
}
export interface PublicationInsightAccountOption {
  id: string;
  label: string;
}
export interface PublicationInsight {
  id: string;
  organizationId: string;
  brandId: string;
  source: string | null;
  platform: ExtensionPublicationPlatform;
  description: string;
  publicationDate: string | null;
  isCapturedObservation: boolean;
  publicationKind: 'post' | 'reply' | 'unknown';
  externalId: string | null;
  url: string | null;
  contextUrl: string | null;
  urlKind: 'permalink' | 'context-only' | 'unavailable';
  urlIdentity: ExtensionPublicationUrlIdentity | null;
  observedVisibility: ExtensionPublicationObservedVisibility;
  credentialId: string | null;
  analyticsAvailability: ExtensionPublicationAnalyticsAvailability;
  collectionState: TargetAnalyticsCollectionState;
  collectionMessage: string | null;
  latestSample: PublicationInsightSample | null;
  linkCandidates: PublicationInsightAccountOption[];
}
export interface PublicationInsightsQuery {
  brandId: string;
  page?: number;
  limit?: number;
  platform?: ExtensionPublicationPlatform;
  source?: 'extension';
  capturedOnly?: boolean;
  credentialId?: string[];
  externalId?: string;
  pageUrl?: string;
  search?: string;
}
export interface PublicationInsightsScope {
  userId: string;
  organizationId: string;
  brandId: string;
}
export interface LinkExternalPublicationCredentialInput {
  brandId: string;
  postId: string;
  credentialId: string;
}
export interface LinkExternalPublicationCredentialResult {
  postId: string;
  credentialId: string;
  analyticsAvailability: ExtensionPublicationAnalyticsAvailability;
}
