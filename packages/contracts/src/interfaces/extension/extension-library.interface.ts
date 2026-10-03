import type { AgentArtifactReference, AgentContentMentionItem } from '../index';
export interface LibraryAsset extends AgentContentMentionItem {
  reference: AgentArtifactReference;
  kind: 'image' | 'video' | 'audio';
}
export interface LibraryLoadOptions {
  page?: number;
  search?: string;
  signal?: AbortSignal;
}
export interface LibraryPage {
  items: LibraryAsset[];
  hasMore: boolean;
}
export interface LibraryDelivery {
  reference: AgentArtifactReference;
  url: string;
}
export interface LibraryHandoffOptions {
  signal?: AbortSignal;
}
export type LibraryHandoffResult =
  | { kind: 'download-started'; downloadId: number }
  | { kind: 'asset-opened' };
