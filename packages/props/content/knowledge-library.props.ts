import type {
  KnowledgeSource,
  KnowledgeSourceVersion,
  KnowledgeSpace,
} from '@genfeedai/client/models';
import type {
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

export interface KnowledgeSourcesListProps {
  brandId: string;
  isAddOpen: boolean;
  onAddClose: () => void;
  /** Called once the pending Brand Kit seed request has been handled. */
  onSeedHandled: () => void;
  /** Monotonic counter; a change above the last handled value seeds the website. */
  seedRequestId: number;
  website?: string;
}

export interface KnowledgeAddSourceSheetProps {
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (request: KnowledgeSourceCaptureRequest) => Promise<void>;
}

export interface KnowledgeSourceDetailSheetProps {
  brandId: string;
  isOpen: boolean;
  onArchive: (source: KnowledgeSource) => Promise<void>;
  onClose: () => void;
  onMoveToSpace: (source: KnowledgeSource, spaceId: string) => Promise<void>;
  onRetry: (source: KnowledgeSource) => Promise<void>;
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

export interface KnowledgeContextPickerProps {
  brandId: string | undefined;
  onChange: (selection: KnowledgeSelection) => void;
  value: KnowledgeSelection;
}
