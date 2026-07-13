import type {
  AgentArtifactReference,
  WorkspaceShellOverlayRegistration,
  WorkspaceShellOverlayRequest,
} from '@genfeedai/interfaces';
import type { Ref, RefObject } from 'react';

export interface WorkspaceOverlayHostProps {
  readonly composerPortalRef?: Ref<HTMLDivElement>;
  readonly fallbackFocusRef: RefObject<HTMLElement | null>;
  readonly isOpen: boolean;
  readonly onDismiss: () => void;
  readonly onSelectLibraryReference?: (
    reference: AgentArtifactReference,
  ) => void;
  readonly overlay: WorkspaceShellOverlayRequest | null;
  readonly registration: WorkspaceShellOverlayRegistration | null;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly threadId?: string | null;
}
