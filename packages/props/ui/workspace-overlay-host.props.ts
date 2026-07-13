import type {
  WorkspaceShellOverlayRegistration,
  WorkspaceShellOverlayRequest,
} from '@genfeedai/interfaces/ui/workspace-shell.interface';
import type { ReactNode, Ref, RefObject } from 'react';

export interface WorkspaceOverlayHostProps {
  readonly composerPortalRef?: Ref<HTMLDivElement>;
  readonly content?: ReactNode;
  readonly fallbackFocusRef: RefObject<HTMLElement | null>;
  readonly isOpen: boolean;
  readonly onDismiss: () => void;
  readonly overlay: WorkspaceShellOverlayRequest | null;
  readonly registration: WorkspaceShellOverlayRegistration | null;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
}
