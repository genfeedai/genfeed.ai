import type {
  KnowledgeSource,
  KnowledgeSourceVersion,
  KnowledgeSpace,
} from '@genfeedai/client/models';
import type {
  AgentKnowledgeCitations,
  KnowledgeReceipt,
  KnowledgeSelection,
  KnowledgeSourceCaptureRequest,
  KnowledgeSourceUpdateRequest,
} from '@genfeedai/contracts/interfaces';

/** Current-version state folded onto a source row for the Library list. */
export interface KnowledgeSourceRow {
  source: KnowledgeSource;
  version?: KnowledgeSourceVersion;
  spaceIds: string[];
}

/** A web address a source was captured from, safe to render as a link. */
export interface KnowledgeSourceLink {
  href: string;
  /** Host and path without the protocol, for display. */
  label: string;
}

/** Why a capture failed, in the terms the sidebar explains it. */
export type KnowledgeFailureKind =
  | 'invalidResult'
  | 'noText'
  | 'serviceUnavailable'
  | 'unreachable'
  | 'unknown';

/** The Knowledge list filters, stored in the URL as `q`, `space`, `status` and `type`. */
export interface KnowledgeFilters {
  /** `null` is every space. */
  spaceId: string | null;
  /** Lowercase processing state, or `null` for every state. */
  status: string | null;
  /** Lowercase source kind, or `null` for every kind. */
  type: string | null;
  search: string;
}

export interface KnowledgeSourcesListProps {
  brandId: string;
  website?: string;
}

export interface KnowledgeAddSourceSheetProps {
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (request: KnowledgeSourceCaptureRequest) => Promise<void>;
}

export interface KnowledgeSourceDetailPanelProps {
  brandId: string;
  onArchive: (source: KnowledgeSource) => Promise<void>;
  onClose: () => void;
  onMoveToSpace: (source: KnowledgeSource, spaceId: string) => Promise<void>;
  onRefresh?: (source: KnowledgeSource) => Promise<void>;
  onRetry: (source: KnowledgeSource) => Promise<void>;
  onUpdateRefreshPolicy?: (
    source: KnowledgeSource,
    policy: { isEnabled: boolean },
  ) => Promise<void>;
  onUpdate: (
    source: KnowledgeSource,
    update: KnowledgeSourceUpdateRequest,
  ) => Promise<void>;
  row: KnowledgeSourceRow | null;
  spaces: KnowledgeSpace[];
}

export interface KnowledgeStateBadgeProps {
  version?: KnowledgeSourceVersion;
}

export interface KnowledgeReferenceSectionProps {
  brandId: string | undefined;
  onChange: (selection: KnowledgeSelection) => void;
  value: KnowledgeSelection;
}

/** A Knowledge pick remembered with the brand it was made under. */
export interface BrandKnowledgeSelection {
  brandId: string | undefined;
  value: KnowledgeSelection;
}

export interface KnowledgeReceiptListProps {
  receipts: KnowledgeReceipt[];
}

export interface KnowledgeCitationListProps {
  citations: AgentKnowledgeCitations;
}
