import type {
  ImportedSourceSnapshotInput,
  ImportedSourceView,
} from '@genfeedai/contracts/api-types/contracts/imported-source.contract';
import type { ImportedSourceMediaView } from '@genfeedai/contracts/api-types/contracts/imported-source-media.contract';
import type { LibraryAsset } from '@genfeedai/contracts/interfaces';

export type { ImportedSourceMediaView, ImportedSourceView };

/** Broadcast by the background after a source changes, so the panel refreshes. */
export const IMPORTED_SOURCES_CHANGED = 'IMPORTED_SOURCES_CHANGED';

export type ImportedSourceKind = ImportedSourceSnapshotInput['kind'];
export type ImportedSourceMediaKind = 'image' | 'video' | 'audio';
export type ImportedSourceMediaAvailability = NonNullable<
  ImportedSourceSnapshotInput['selectedMedia']
>['availability'];

/** What the user asked to capture. `media` is a right-clicked image, video or audio. */
export type SourceCaptureScope = 'page' | 'selection' | 'link' | 'media';

export interface SourceCaptureRequest {
  mediaKind?: ImportedSourceMediaKind;
  /** The page the user chose the capture on; a different active tab is rejected. */
  pageUrl?: string;
  scope: SourceCaptureScope;
  /** The URL of a right-clicked link or media element. */
  targetUrl?: string;
}

/** `social` is a feed-based network where only a selection or the link is captured. */
export type SourceCaptureHost = 'x' | 'reddit' | 'youtube' | 'social';

/** Where a media candidate was found; players are platform-hosted. */
export type SourceMediaOrigin =
  | 'element'
  | 'player'
  | 'meta'
  | 'structured-data'
  | 'link'
  | 'selected';

export interface RawMediaCandidate {
  kind: ImportedSourceMediaKind;
  origin: SourceMediaOrigin;
  url: string;
  label?: string;
}

/** What the page extractor returns. It is validated and sanitized by the background. */
export interface RawSourceCapture {
  author?: string;
  authorHandle?: string;
  /** `rel=canonical` or `og:url`, when the page declares one. */
  canonicalUrl?: string;
  externalIdentity?: string;
  host?: SourceCaptureHost;
  /** Why only part of the page could be captured, shown to the user. */
  limitation?: string;
  media: RawMediaCandidate[];
  scope: SourceCaptureScope;
  siteName?: string;
  text: string;
  /** The text is the user's selection, not the whole page. */
  isSelection: boolean;
  title: string;
  /** Structured type hints such as `og:type` or JSON-LD `@type`, lowercased. */
  typeHints: string[];
  url: string;
}

export interface SourceMediaChoice {
  availability: ImportedSourceMediaAvailability;
  kind: ImportedSourceMediaKind;
  label: string;
  note: string;
  url: string;
}

export interface SourceCapturePreview {
  authorLabel: string;
  basis: ImportedSourceSnapshotInput['contentBasis'];
  excerpt: string;
  host: string;
  kind: ImportedSourceKind;
  limitation?: string;
  media: SourceMediaChoice[];
  title: string;
}

export interface SourceSaveRequest {
  kind?: ImportedSourceKind;
  /** Index into the capture's media choices, or null for none. */
  mediaIndex?: number | null;
  raw: RawSourceCapture;
}

export interface SourceSaveResult {
  deduplicated: boolean;
  source: ImportedSourceView;
}

export interface KnowledgeHandoff {
  mode: 'link' | 'page' | 'selection';
  text: string;
  title: string;
  url: string;
}

export interface ImportedSourcesPageProps {
  initialCapture?: SourceCaptureRequest;
  onAddToKnowledge: (handoff: KnowledgeHandoff) => void;
  onUseReference: (asset: LibraryAsset) => void;
}

export interface ImportedSourceResponse<T> {
  code?: string;
  data?: T;
  deletedSourceId?: string;
  error?: string;
  success?: boolean;
}

export interface SourceCaptureCardProps {
  isBusy: boolean;
  kind: ImportedSourceKind;
  mediaIndex: number | null;
  onAddToKnowledge: () => void;
  onDiscard: () => void;
  onKindChange: (kind: ImportedSourceKind) => void;
  onMediaChange: (index: number | null) => void;
  onSave: () => void;
  preview: SourceCapturePreview;
}

export interface ImportedSourceCardProps {
  isBusy: boolean;
  media: ImportedSourceMediaView | undefined;
  onAddToKnowledge: (source: ImportedSourceView) => void;
  onCheckMedia: (source: ImportedSourceView) => void;
  onOpenOriginal: (url: string) => void;
  onPrepareMedia: (source: ImportedSourceView) => void;
  onRetryMedia: (
    source: ImportedSourceView,
    media: ImportedSourceMediaView,
  ) => void;
  onUseReference: (asset: LibraryAsset) => void;
  source: ImportedSourceView;
}
