import type { ExtensionPublicationPlatform } from '../content/extension-publication.interface';
import type { PublicationInsight } from '../content/publication-insights.interface';
import type { ExtensionWorkspaceSnapshot } from './extension-workspace.interface';

export interface ExtensionPublicationPageLookup {
  platform: ExtensionPublicationPlatform;
  pageUrl: string;
}
export interface ExtensionPublicationInsightPage {
  items: PublicationInsight[];
  page: number;
  limit: number;
  pages: number;
  total: number;
}
export interface ExtensionPublicationInsightRequestOptions {
  snapshot: ExtensionWorkspaceSnapshot;
  signal?: AbortSignal;
}
export interface ExtensionPublicationInsightsState {
  key: string;
  page: number;
  pageData: ExtensionPublicationInsightPage | null;
  selectedPostId: string | null;
  insight: PublicationInsight | null;
  isLoading: boolean;
  isBusy: boolean;
  error: string | null;
  notice: string | null;
}
export type ExtensionPublicationInsightsErrorCode =
  | 'request-failed'
  | 'invalid-response'
  | 'forbidden'
  | 'not-found'
  | 'unavailable'
  | 'rate-limited';
