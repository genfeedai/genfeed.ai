import type {
  AgentArtifactReference,
  WorkspaceShellOverlayRegistration,
  WorkspaceShellOverlayRequest,
} from '@genfeedai/interfaces';
import type { ReactNode, Ref, RefObject } from 'react';

export interface WorkspaceOverlayHostProps {
  readonly composerPortalRef?: Ref<HTMLDivElement>;
  readonly content?: ReactNode;
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
